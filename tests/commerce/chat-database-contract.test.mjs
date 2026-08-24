import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationsUrl = new URL('../../supabase/migrations/', import.meta.url);
const pgTapSql = readFileSync(new URL('../../supabase/tests/rls_contract.sql', import.meta.url), 'utf8');
const matchingMigrations = readdirSync(migrationsUrl)
  .filter((name) => name.endsWith('_unified_marketplace_chat_core.sql'));

test('the CLI generated exactly one unified marketplace chat migration', () => {
  assert.equal(matchingMigrations.length, 1);
});

const sql = matchingMigrations.length === 1
  ? readFileSync(new URL(matchingMigrations[0], migrationsUrl), 'utf8')
  : '';

const routineSql = (name) => sql.match(new RegExp(
  `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'u',
))?.[0] ?? '';

test('chat persistence adds participant, message, reaction, and idempotency contracts', () => {
  assert.match(sql, /create table public\.marketplace_chat_participants/u);
  assert.match(sql, /primary key \(thread_id, user_id, participant_role\)/u);
  assert.match(sql, /client_message_id uuid/u);
  assert.match(sql, /create table public\.marketplace_chat_reactions/u);
  assert.match(sql, /create unique index support_messages_sender_client_key/u);
  assert.match(sql, /'presale', 'order', 'support', 'dispute'/u);
  assert.match(sql, /'text', 'image', 'product', 'store', 'order', 'location', 'system'/u);
});

test('participant-scoped RPCs authenticate callers and expose bounded keyset APIs', () => {
  for (const routine of [
    'open_my_marketplace_conversation',
    'list_my_marketplace_conversations',
    'get_my_marketplace_conversation_page',
    'search_my_marketplace_chat_messages',
    'send_my_marketplace_chat_message',
    'set_my_marketplace_chat_read_cursor',
    'react_to_my_marketplace_chat_message',
    'delete_my_marketplace_chat_message',
    'set_my_marketplace_chat_preferences',
    'block_my_marketplace_chat_counterparty',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${routine}`, 'u'));
  }
  assert.match(sql, /select auth\.uid\(\)/u);
  assert.match(sql, /p_before_created_at/u);
  assert.match(sql, /p_before_id/u);
  assert.match(sql, /raise exception 'not_found'/u);
});

test('chat tables and definer routines are denied by default and granted narrowly', () => {
  assert.match(sql, /set search_path = ''/u);
  assert.match(sql, /revoke all on table public\.support_messages from public, anon, authenticated/u);
  assert.match(sql, /revoke all on function public\.send_my_marketplace_chat_message/u);
  assert.match(sql, /grant execute on function public\.send_my_marketplace_chat_message/u);
  assert.doesNotMatch(sql, /auth\.jwt\(\).*user_metadata/su);
});

test('private Realtime authorization and delivery reassignment reuse durable access', () => {
  assert.match(sql, /realtime\.topic\(\)/u);
  assert.match(sql, /marketplace-chat:/u);
  assert.match(sql, /realtime\.messages\.extension in \('broadcast', 'presence'\)/u);
  assert.match(sql, /create or replace function public\.sync_marketplace_chat_driver_participant/u);
  assert.match(sql, /participant_role = 'driver'/u);
  assert.match(sql, /removed_at = coalesce\(removed_at, now\(\)\)/u);
});

test('nullable RPC inputs are rejected explicitly under PostgreSQL three-valued logic', () => {
  assert.match(sql, /if p_kind is null or p_kind not in \('presale', 'order'\)/u);
  assert.match(sql, /if p_limit is null or p_limit not between 1 and 100/u);
  assert.match(sql, /p_kind is null\s+or p_kind not in \('text', 'image', 'product', 'store', 'order', 'location'\)/u);
  assert.match(sql, /jsonb_typeof\(p_card_data -> 'latitude'\) is distinct from 'number'/u);
  assert.match(sql, /p_emoji is null or p_emoji not in/u);
});

test('message DTOs enrich card inputs to match the Task 1 output contract', () => {
  assert.match(sql, /'label', product\.name/u);
  assert.match(sql, /'label', store\.name/u);
  assert.match(sql, /'label', marketplace_order\.public_code/u);
  assert.match(sql, /'label', 'Shared location'/u);
});

test('Realtime broadcasts only reconciliation hints and never deleted content', () => {
  const broadcast = routineSql('broadcast_marketplace_chat_change');
  assert.match(broadcast, /realtime\.send\(/u);
  assert.match(broadcast, /'messageId'/u);
  assert.match(broadcast, /'conversationId'/u);
  assert.doesNotMatch(broadcast, /realtime\.broadcast_changes|deleted_body|old\.body|to_jsonb\(/u);
});

test('only order-operating store roles become merchant chat participants', () => {
  const capabilityChecks = sql.match(/membership\.role in \('owner', 'manager', 'fulfillment'\)/gu) ?? [];
  assert.ok(capabilityChecks.length >= 5, `expected repeated durable capability checks, got ${capabilityChecks.length}`);
  assert.doesNotMatch(routineSql('sync_marketplace_chat_store_participant'), /joined_at = now\(\)/u);
  assert.match(routineSql('sync_marketplace_chat_store_participant'), /case when .*removed_at is not null.* then now\(\)/su);
});

test('blocking stores and enforces one exact participant pair without removing read access', () => {
  assert.match(sql, /create table public\.marketplace_chat_blocks/u);
  assert.match(sql, /primary key \(thread_id, blocker_user_id, blocked_user_id\)/u);
  assert.match(routineSql('block_my_marketplace_chat_counterparty'), /blocked_user_id/u);
  assert.match(routineSql('send_my_marketplace_chat_message'), /blocker_user_id = v_actor_id/u);
  assert.match(routineSql('send_my_marketplace_chat_message'), /blocked_user_id = v_actor_id/u);
  assert.doesNotMatch(routineSql('can_access_marketplace_chat_thread'), /marketplace_chat_blocks/u);
});

test('active customer-driver blocks create one constrained assigned-admin support escalation', () => {
  const block = routineSql('block_my_marketplace_chat_counterparty');
  assert.match(sql, /create table public\.marketplace_chat_block_escalations/u);
  assert.match(sql, /primary key \(source_thread_id, blocker_user_id, blocked_user_id\)/u);
  assert.match(block, /pg_advisory_xact_lock/u);
  assert.match(block, /conversation_kind[\s\S]*'support'/u);
  assert.match(block, /marketplace_chat_block_escalations/u);
  assert.match(block, /participant\.user_id is distinct from p_counterparty_id/u);
  assert.match(block, /'supportEscalationConversationId'/u);
  assert.match(block, /'orderSupportAvailable'/u);
  assert.match(routineSql('can_access_marketplace_chat_thread'), /thread\.assigned_admin_id = v_actor_id[\s\S]*membership\.role::text in \('support', 'super_admin', 'chat_monitor'\)/u);
  assert.match(routineSql('send_my_marketplace_chat_message'), /participant\.participant_role = 'admin'[\s\S]*v_thread\.assigned_admin_id = v_actor_id/u);
});

test('SQL accepts only exact bounded card shapes from Task 1', () => {
  const send = routineSql('send_my_marketplace_chat_message');
  assert.match(send, /octet_length\(p_card_data::text\) > 512/u);
  assert.match(send, /p_card_data - 'type' - 'id' <> '\{\}'::jsonb/u);
  assert.match(send, /p_card_data - 'type' - 'latitude' - 'longitude' <> '\{\}'::jsonb/u);
});

test('driver authorization requires an active driver profile and deactivation sync', () => {
  assert.match(routineSql('can_access_marketplace_chat_thread'), /profile\.role = 'driver'.*profile\.is_active/su);
  assert.match(routineSql('sync_marketplace_chat_driver_participant'), /profile\.role = 'driver'.*profile\.is_active/su);
  assert.match(sql, /create or replace function public\.sync_marketplace_chat_driver_profile/u);
  assert.doesNotMatch(routineSql('sync_marketplace_chat_driver_participant'), /joined_at = now\(\)/u);
});

test('message search uses an indexed document and a hard conversation ceiling', () => {
  assert.match(sql, /search_document tsvector/u);
  assert.match(sql, /using gin \(search_document\)/u);
  assert.match(routineSql('search_my_marketplace_chat_messages'), /message\.search_document @@/u);
  assert.match(routineSql('send_my_marketplace_chat_message'), />= 100000/u);
});

test('pgTAP runtime coverage has a correct plan for the review threat matrix', () => {
  const planned = Number(pgTapSql.match(/extensions\.plan\((\d+)\)/u)?.[1]);
  const extensionAssertions = pgTapSql.match(/select extensions\.(?:is|isnt|ok|throws_ok)\(/gu) ?? [];
  const realtimePolicyAssertions = pgTapSql.match(/select pg_temp\.assert_marketplace_realtime_insert_policy\(/gu) ?? [];
  const helperImplementationAssertions = pgTapSql.match(/select extensions\.is\(v_allowed,/gu) ?? [];
  const runtimeAssertionCount = extensionAssertions.length
    - helperImplementationAssertions.length
    + realtimePolicyAssertions.length;
  assert.equal(planned, runtimeAssertionCount);
  for (const evidence of [
    'anon cannot execute',
    'owner of an unrelated store',
    'catalog-only store member',
    'assigned but inactive driver',
    'Realtime messages has authenticated receive and send policies',
    'idempotent retries persist one row',
    'next keyset page',
    'allowlisted reaction',
    'cannot move backwards',
    'tombstoned participant DTO',
    'clear mute preferences',
    'exact blocked pair',
    'preserve joined_at',
    'indexed full-text search',
    'customer-driver block returns one stable support escalation',
    'blocked driver cannot access the substitute support thread',
    'actual realtime.messages INSERT policy accepts the participant topic',
    'catalog-only membership synchronization removes chat participation',
  ]) assert.match(pgTapSql, new RegExp(evidence, 'u'));
  assert.match(pgTapSql, /created_at = timestamp with time zone/u);
  assert.match(pgTapSql, /insert into realtime\.messages/u);
});
