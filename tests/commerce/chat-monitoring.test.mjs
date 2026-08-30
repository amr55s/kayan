import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { parseMonitorSearchFilters } from '../../lib/commerce/chat/monitor-filters.ts';

const migrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .find((name) => name.endsWith('_marketplace_chat_monitoring_notifications.sql'));
const migrationPath = new URL(`../../supabase/migrations/${migrationName}`, import.meta.url);
const riskPath = new URL('../../lib/commerce/chat/risk.ts', import.meta.url);
const monitorPath = new URL('../../components/marketplace/chat/admin-monitor.tsx', import.meta.url);
const monitorOpenPath = new URL('../../components/marketplace/chat/monitor-open-audit.tsx', import.meta.url);
const monitorRoutePath = new URL('../../app/admin/marketplace/chat/[id]/page.tsx', import.meta.url);
const monitorIndexPath = new URL('../../app/admin/marketplace/chat/page.tsx', import.meta.url);
const guardPath = new URL('../../lib/auth/guards.ts', import.meta.url);

const source = (path) => readFileSync(path, 'utf8');

test('monitoring is restricted to the dedicated AAL2 chat_monitor capability', () => {
  const guard = source(guardPath);
  const migration = source(migrationPath);
  assert.match(guard, /capability\?: 'chat_monitor'/u);
  assert.match(migration, /activate_marketplace_admin_capability\(array\['chat_monitor'\]/u);
  assert.doesNotMatch(migration, /array\['super_admin',\s*'support',\s*'chat_monitor'\]/u);
});

test('monitoring RPCs audit bounded reads/actions and retain an append-only audit trail', () => {
  const migration = source(migrationPath);
  for (const rpc of [
    'list_marketplace_chat_monitor_queue', 'get_marketplace_chat_as_monitor',
    'record_marketplace_chat_monitor_open', 'moderate_marketplace_chat', 'export_marketplace_chat_monitor_queue',
  ]) assert.match(migration, new RegExp(`function public\\.${rpc}\\(`, 'u'));
  assert.match(migration, /marketplace_chat_monitor_open_once/u);
  assert.match(migration, /revoke update, delete on public\.marketplace_chat_audit from public, anon, authenticated/u);
  assert.match(migration, /action in \('open', 'search', 'export', 'moderate'\)/u);
  for (const filter of ['role','storeId','orderId','driverId','unread','report','risk','status','from','to']) assert.match(migration, new RegExp(`'${filter}'`, 'u'));
});

test('reports are participant scoped, original messages remain immutable, and signals never suspend', () => {
  const migration = source(migrationPath);
  assert.match(migration, /function public\.report_my_marketplace_chat_message\(/u);
  assert.match(migration, /can_access_marketplace_chat_thread\(v_thread_id\)/u);
  assert.doesNotMatch(migration, /update public\.support_messages/iu);
  assert.doesNotMatch(migration, /suspend(?:ed|_account|_user)?\s*=/iu);
});

test('risk classifier emits only deterministic rule ids/counts, never message bodies', () => {
  const risk = source(riskPath);
  assert.match(risk, /export (?:function|const) classifyChatRisk/u);
  for (const type of ['external_contact', 'off_platform_payment', 'duplicate_outreach', 'velocity', 'reports', 'denied_access']) {
    assert.match(risk, new RegExp(`'${type}'`, 'u'));
  }
  assert.match(risk, /phone_detected|external_link_detected|off_platform_payment_phrase/u);
  assert.match(risk, /normalized === 'dairtak\.com' \|\| normalized\.endsWith\('\.dairtak\.com'\)/u);
  assert.doesNotMatch(risk, /hostname\.endsWith\('dairtak\.com'\)/u);
  assert.doesNotMatch(risk, /console\.(?:log|info|warn|error)\([^)]*(?:body|message)/u);
});

test('admin monitor uses documented HeroUI controls and requires a moderation reason', () => {
  const monitor = source(monitorPath);
  assert.match(monitor, /from '@heroui\/react'/u);
  assert.match(monitor, /\bSelect\b/u);
  assert.match(monitor, /\bListBox\b/u);
  assert.match(monitor, /\bTextField\b/u);
  assert.match(monitor, /<TextArea/u);
  assert.match(monitor, /<Label/u);
  assert.match(monitor, /minLength=\{5\}/u);
  assert.match(monitor, /maxLength=\{500\}/u);
  assert.match(monitor, /<Drawer/u);
  for (const name of ['unread', 'report', 'risk']) {
    assert.match(monitor, new RegExp(`<MonitorSelect name="${name}"`, 'u'));
  }
  assert.doesNotMatch(monitor, /<select\b/u);
  assert.doesNotMatch(monitor, /<input(?!\s+type="hidden")\b/u);
});

test('monitor query filters isolate invalid values and canonicalize valid times', () => {
  const page = source(monitorIndexPath);
  assert.match(page, /parseMonitorSearchFilters/u);
  assert.match(page, /listChatMonitorQueue\(filters\)/u);
  assert.match(page, /filters=\{filters\}/u);

  const id = crypto.randomUUID();
  const parsed = parseMonitorSearchFilters({
    role: 'merchant',
    status: 'invalid',
    storeId: id,
    orderId: 'not-a-uuid',
    unread: 'true',
    report: 'false',
    risk: 'not-a-boolean',
    from: '2026-08-30T10:00:00+03:00',
    to: 'invalid-time',
  });
  assert.deepEqual(parsed, {
    role: 'merchant', storeId: id, unread: true, report: false,
    from: '2026-08-30T07:00:00.000Z',
  });
  assert.deepEqual(parseMonitorSearchFilters({
    from: '2026-08-30T12:00:00.000Z', to: '2026-08-30T10:00:00.000Z', risk: 'true',
  }), { from: '2026-08-30T12:00:00.000Z', risk: true });
});

test('monitor opens use a browser-session id and the deduplicating audit RPC', () => {
  const route = source(monitorRoutePath);
  assert.match(route, /getMarketplaceChatAsMonitor/u);
  assert.doesNotMatch(route, /MonitorOpenAudit|\bgetConversationPage\b/u);
});
