import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationsUrl = new URL('../../supabase/migrations/', import.meta.url);
const matchingMigrations = readdirSync(migrationsUrl)
  .filter((name) => name.endsWith('_unified_marketplace_chat_core.sql'));

test('the CLI generated exactly one unified marketplace chat migration', () => {
  assert.equal(matchingMigrations.length, 1);
});

const sql = matchingMigrations.length === 1
  ? readFileSync(new URL(matchingMigrations[0], migrationsUrl), 'utf8')
  : '';

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
