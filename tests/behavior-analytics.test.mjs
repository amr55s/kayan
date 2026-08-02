import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('behavior analytics is anonymous, allow-listed, aggregated, and server-only', () => {
  const route = read('app/api/analytics-events/route.ts');
  const migration = read('supabase/migrations/202607280001_place_details_reliability.sql');
  const client = read('lib/analytics/client.ts');

  assert.match(route, /MAX_BODY_BYTES = 2_048/);
  assert.match(route, /origin !== requestUrl\.origin/);
  assert.match(route, /visitorId: z\.string\(\)\.uuid\(\)/);
  assert.match(route, /record_site_analytics/);
  assert.match(route, /sharedEntityEvents/);
  assert.match(
    route,
    /payload\.targetType === 'place' \|\| payload\.targetType === 'driver'/,
  );
  assert.doesNotMatch(route, /x-forwarded-for|x-real-ip|user-agent/i);
  assert.doesNotMatch(
    client,
    /searchQuery\s*:|contactPhone\s*:|userAgent\s*:|ipAddress\s*:/i,
  );

  assert.match(migration, /create table if not exists public\.analytics_daily_events/);
  assert.match(migration, /primary key \(event_date, event_name, target_type, target_key, route\)/);
  assert.match(migration, /alter table public\.analytics_daily_events enable row level security/);
  assert.match(
    migration,
    /revoke all on function public\.record_site_analytics[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_site_analytics[\s\S]*to service_role/,
  );
});

test('place cards show durable real view counts backed by analytics', () => {
  const card = read('components/directory/PlaceCard.tsx');
  const migration = read(
    'supabase/migrations/20260731100054_add_real_place_view_counts.sql',
  );

  assert.match(card, /place\.view_count/);
  assert.match(card, /مشاهدة/);
  assert.match(migration, /add column if not exists view_count/);
  assert.match(migration, /event_name = 'place_open'/);
  assert.match(migration, /view_count = view_count \+ v_delta/);
  assert.doesNotMatch(migration, /random\(\)|fake|boost/i);
});

test('admin receives a simple analytics dashboard without exposing visitor hashes', () => {
  const page = read('app/admin/page.tsx');
  const loader = read('lib/analytics/admin.ts');
  const workspace = read('components/operations/AdminWorkspace.tsx');

  assert.match(page, /loadBehaviorAnalytics\(\)/);
  assert.match(workspace, /تفاعل الزوار/);
  assert.match(workspace, /أكثر ما يضغط عليه الزوار/);
  assert.match(workspace, /أكثر الأماكن تفاعلاً/);
  assert.doesNotMatch(workspace, /visitor_hash|visitorHash/);
  assert.match(loader, /new Set\(visitors\.map/);
});

test('public writes are mediated by the server while admin retains full control', () => {
  const actions = read('lib/supabase/actions.ts');
  const adminActions = read('lib/supabase/admin-actions.ts');
  const postDeploy = read('supabase/migrations/202607280002_revoke_legacy_privileges.sql');

  assert.match(actions, /consume_public_submission_rate_limit/);
  assert.match(actions, /record_place_upvote/);
  assert.match(actions, /createAdminClient\(\)/);
  assert.doesNotMatch(
    actions.slice(actions.indexOf('submitFeedbackSubmission')),
    /\.from\('places'\)\s*\.update/,
  );
  assert.doesNotMatch(adminActions, /createClient\(\)/);
  assert.match(postDeploy, /revoke insert on public\.feedback_requests from anon, authenticated/);
  assert.match(postDeploy, /revoke insert, update, delete on public\.places from anon, authenticated/);
});

test('details view has rounded responsive edges, clear exit, and an in-app full image viewer', () => {
  const details = read('components/directory/PlaceDetailsModal.tsx');
  const modal = read('components/ui/heroui-compat.tsx');
  const styles = read('app/globals.css');

  assert.match(details, /rounded-\[1\.5rem\]/);
  assert.match(details, />رجوع</);
  assert.match(details, /إغلاق الصور/);
  assert.match(details, /onTouchStart/);
  assert.match(details, /object-contain/);
  assert.match(modal, /data-modal-closing/);
  assert.match(styles, /kayan-modal-panel-out/);
  assert.match(modal, /style=\{\{ color: selected \? '#ffffff'/);
});
