import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260810079000_marketplace_notifications.sql');

test('notification inbox is RPC-only, auth-bound, paginated, and idempotent', () => {
  assert.match(migration, /create or replace function public\.list_my_marketplace_notifications/);
  assert.match(migration, /notification\.recipient_id = v_user/);
  assert.match(migration, /count_my_unread_marketplace_notifications/);
  assert.match(migration, /mark_my_marketplace_notification_read/);
  assert.match(migration, /mark_all_my_marketplace_notifications_read/);
  assert.match(migration, /on conflict \(event_key\) do update/);
  assert.match(migration, /revoke select on table public\.app_notifications from authenticated/);
  assert.match(migration, /drop policy if exists app_notifications_mark_read_own/);
  assert.match(migration, /p_limit not between 1 and 50/);
});

test('business events resolve recipients without exposing contact data', () => {
  for (const trigger of [
    'marketplace_orders_notify', 'product_reviews_notify', 'support_messages_notify',
    'stores_moderation_notify', 'products_moderation_notify',
    'marketplace_delivery_offers_notify', 'commission_statements_notify',
    'cash_reconciliation_batches_notify',
  ]) assert.match(migration, new RegExp(`create trigger ${trigger}`));
  assert.match(migration, /membership\.is_active/);
  assert.match(migration, /profile\.role = 'admin'/);
  assert.doesNotMatch(migration, /jsonb_build_object\([^)]*(phone|email|address)/isu);
  assert.doesNotMatch(migration, /whatsapp/iu);
});

test('push subscriptions and jobs enforce least privilege and bounded retries', () => {
  assert.match(migration, /revoke all on table public\.push_subscriptions from public, anon, authenticated/);
  assert.match(migration, /register_my_push_subscription/);
  assert.match(migration, /public\.push_subscriptions\.user_id = v_user/);
  assert.match(migration, /public\.push_subscriptions\.p256dh = excluded\.p256dh/);
  assert.match(migration, /p_endpoint !~ '\^https:/);
  assert.match(migration, /marketplace_push_endpoint_allowed\(p_endpoint\)/);
  assert.match(migration, /for update of job skip locked/);
  assert.match(migration, /job\.attempts < 5/);
  assert.match(migration, /job\.attempts >= 5/);
  assert.match(migration, /'expired_subscription'.*'rate_limited'.*'provider_unavailable'/su);
  assert.match(migration, /grant execute on function public\.claim_marketplace_push_jobs\(integer, uuid\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.claim_marketplace_push_jobs[^;]+authenticated/su);
});

test('push route uses same-origin validation and auth-bound RPCs', () => {
  const route = read('app/api/push/subscribe/route.ts');
  const validation = read('lib/commerce/push-validation.ts');
  assert.match(route, /request\.headers\.get\('origin'\)/);
  assert.match(route, /origin !== requestUrlOrigin && origin !== configured/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /register_my_push_subscription/);
  assert.match(route, /unregister_my_push_subscription/);
  assert.doesNotMatch(route, /\.from\('push_subscriptions'\)/);
  assert.match(route, /isAllowedPushEndpoint/);
  assert.match(validation, /fcm\.googleapis\.com/);
  assert.match(validation, /notify\\\.windows\\\.com/);
  assert.match(route, /بيانات اشتراك الإشعارات غير صالحة/);
});

test('push worker and service worker keep payloads generic and links same-origin', () => {
  const worker = read('lib/commerce/push-worker.ts');
  const serviceWorker = read('public/sw.js');
  const cron = read('app/api/cron/push-notifications/route.ts');
  assert.match(worker, /MAX_BATCH = 25/);
  assert.match(worker, /MAX_CONCURRENCY = 5/);
  assert.match(worker, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(worker, /body: 'لديك تحديث جديد داخل ديرتك\.'/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /processMarketplacePushJobs\(25\)/);
  assert.match(serviceWorker, /showNotification\('DAIRTAK'/);
  assert.match(serviceWorker, /\^\\\/\(account\|merchant\|admin\|driver\)/);
  assert.doesNotMatch(serviceWorker, /payload\.title|payload\.body/);
  assert.match(serviceWorker, /'\/account\/notifications'/);
});

test('hosted push schedule reads its endpoint and secret only from Vault', () => {
  assert.match(migration, /create or replace function public\.invoke_marketplace_push_worker/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /dairtak_worker_base_url/);
  assert.match(migration, /dairtak_worker_cron_secret/);
  assert.match(migration, /'\/api\/cron\/push-notifications'/);
  assert.match(migration, /'dairtak-marketplace-push-worker'/);
  assert.doesNotMatch(migration, /Bearer [A-Za-z0-9_-]{20,}/);
});
