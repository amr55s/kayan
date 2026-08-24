import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260818174325_harden_marketplace_abuse_and_scaling.sql');

test('push registration is auth-bound, rate limited, capped, and transfer safe', () => {
  const route = read('app/api/push/subscribe/route.ts');
  assert.match(migration, /marketplace_actor_rate_limits/);
  assert.match(migration, /consume_my_marketplace_rate_limit\('push_register', 20, 3600\)/);
  assert.match(migration, /where user_id = v_user and is_active/);
  assert.match(migration, /v_active_count >= 8/);
  assert.match(migration, /v_existing\.p256dh = p_p256dh and v_existing\.auth = p_auth/);
  assert.match(migration, /subscription\.user_id = job\.recipient_id/);
  assert.match(migration, /subscription\.user_id <> job\.recipient_id/);
  assert.match(migration, /failure_code = 'invalid_subscription'/);
  assert.match(migration, /revoke all on table public\.marketplace_actor_rate_limits from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.consume_my_marketplace_rate_limit[^;]+authenticated/s);
  assert.match(route, /push_\(\?:registration_rate_limited\|subscription_limit_reached\)/);
  assert.match(route, /status: 429/);
  assert.match(route, /'retry-after': '3600'/);
});

test('support creation and replies have atomic actor and thread bounds', () => {
  assert.match(migration, /consume_my_marketplace_rate_limit\('support_create', 5, 3600\)/);
  assert.match(migration, /created_by_user_id = v_actor_id and status not in \('resolved', 'closed'\)/);
  assert.match(migration, />= 20/);
  assert.match(migration, /consume_my_marketplace_rate_limit\('support_reply', 30, 600\)/);
  assert.match(migration, /select \* into v_thread from public\.support_threads where id = p_thread_id for update/);
  assert.match(migration, /v_message_count >= 500/);
});

test('support messages use a bounded composite cursor end to end', () => {
  const adapter = read('lib/commerce/operations.ts');
  const view = read('components/commerce-operations/support-thread.tsx');
  assert.match(migration, /get_my_marketplace_support_thread_page/);
  assert.match(migration, /\(message\.created_at, message\.id\) < \(p_before_created_at, p_before_id\)/);
  assert.match(migration, /limit p_limit \+ 1/);
  assert.match(migration, /p_limit not between 1 and 100/);
  assert.doesNotMatch(migration, /jsonb_agg[\s\S]{0,5000}from public\.support_messages as message where message\.thread_id = v_thread\.id/);
  assert.match(adapter, /get_my_marketplace_support_thread_page/);
  assert.match(adapter, /p_before_created_at: cursor\?\.createdAt \?\? null/);
  assert.match(view, /رسائل أقدم/);
  assert.match(view, /العودة لأحدث الرسائل/);
});

test('public driver summaries are bounded inside one contact-free RPC', () => {
  const service = read('lib/services/queries.ts');
  assert.match(migration, /list_public_driver_summaries\(p_limit integer default 4\)/);
  assert.match(migration, /p_limit not between 1 and 12/);
  assert.match(migration, /limit p_limit/);
  assert.doesNotMatch(migration.slice(migration.indexOf('create or replace function public.list_public_driver_summaries')), /phone|whatsapp/iu);
  assert.match(service, /rpc\('list_public_driver_summaries'/);
  assert.doesNotMatch(service, /list_public_(?:legacy|registered)_drivers/);
  assert.doesNotMatch(service, /createAdminClient/);
});

test('qualified substring calls use PostgreSQL function argument syntax', () => {
  const notifications = read('supabase/migrations/20260810079000_marketplace_notifications.sql');
  assert.doesNotMatch(`${notifications}\n${migration}`, /pg_catalog\.substring\([^\r\n]+\sfrom\s/);
  assert.match(notifications, /pg_catalog\.substring\(p_endpoint, '\^https:/);
});
