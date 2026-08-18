import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('marketing groups and campaign data stay server-only', () => {
  const migration = read('supabase/migrations/20260729103934_marketing_center.sql');
  for (const table of ['marketing_channels', 'marketing_campaigns', 'marketing_publications']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  }
  assert.match(migration, /grant select, insert, update, delete on public\.marketing_channels to service_role/);
  assert.match(migration, /record_site_analytics_v2/);
  assert.match(migration, /campaign_key/);
  assert.match(migration, /select public\.record_site_analytics_v2/);
});

test('legacy marketing channel actions remain admin-only and validated', () => {
  const actions = read('lib/marketing/admin-actions.ts');
  assert.match(
    actions,
    /requireMarketplaceAdminRole\(\['super_admin'\], \{ failureMode: 'throw' \}\)/,
  );
  assert.match(actions, /placeDetailsValidators\.whatsappGroup/);
  assert.match(actions, /\.from\('marketing_channels'\)/);
  assert.match(actions, /\.from\('marketing_campaigns'\)/);
  assert.match(actions, /\.from\('marketing_publications'\)/);
});

test('marketing cards resolve real entities and encode a direct QR link', () => {
  const route = read('app/api/marketing-card/route.ts');
  assert.match(route, /QRCode\.toBuffer\(targetUrl/);
  assert.match(route, /\.from\('places'\)/);
  assert.match(route, /fetchPublicDrivers\(\)/);
  assert.match(route, /طلب ومتابعة من داخل الموقع/);
  assert.doesNotMatch(route, /driver\.phone|place\.phone/);
  assert.match(route, /cache-control/);
  assert.match(route, /Too many card requests/);
  assert.match(route, /renderSize = isPreview \? 540 : 1080/);
  assert.match(route, /width: isPreview \? 130 : 260/);
  assert.match(route, /Promise\.all/);
});

test('drivers have shareable deep links with resilient back navigation', () => {
  const directory = read('components/directory/DirectoryView.tsx');
  const card = read('components/delivery/DriverCard.tsx');
  const modal = read('components/delivery/DriverDetailsModal.tsx');
  assert.match(directory, /searchParams\.get\('driver'\)/);
  assert.match(directory, /params\.set\('driver', driverId\)/);
  assert.match(directory, /params\.delete\('driver'\)/);
  assert.match(directory, /DriverDetailsModal/);
  assert.match(card, /detailsHref/);
  assert.match(modal, /trackSiteEvent\('driver_open'|trackSiteEvent\('whatsapp_click'/);
});

test('public guide and share kit cover residents, merchants, and drivers', () => {
  const guide = read('app/guide/page.tsx');
  const share = read('app/share/page.tsx');
  const hub = read('components/marketing/PublicShareHub.tsx');
  assert.match(guide, /للسكان والمستخدمين/);
  assert.match(guide, /للمحلات والخدمات/);
  assert.match(guide, /لكباتن التوصيل/);
  assert.match(guide, /أكمل الطلب والدفع عند الاستلام/);
  assert.match(share, /PublicShareHub/);
  assert.match(hub, /marketing_share_click/);
  assert.match(hub, /card_download/);
  assert.match(hub, /loading="eager"/);
  assert.match(hub, /IntersectionObserver/);
  assert.match(hub, /content-visibility:auto/);
  assert.match(hub, /حدّد النص التالي وانسخه من داخل الموقع/);
  assert.doesNotMatch(hub, /wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|place\.phone|driver\.phone/i);
  assert.match(share, /sharePlaces/);
  assert.match(share, /shareDrivers/);
});

test('public marketing cards cannot bypass directory RLS or select private place columns', () => {
  const card = read('app/api/marketing-card/route.ts');
  assert.match(card, /createPublicClient\(\)/u);
  assert.match(card, /\.select\('id,title,images'\)/u);
  assert.doesNotMatch(card, /createAdminClient|\.select\(['"]\*['"]\)/u);
});

test('active marketing surfaces do not wire legacy community contact links', () => {
  const activeSurfaces = [
    'app/layout.tsx',
    'app/guide/page.tsx',
    'app/share/page.tsx',
    'components/marketing/PublicShareHub.tsx',
    'components/admin/MarketingCenter.tsx',
  ];

  for (const file of activeSurfaces) {
    assert.doesNotMatch(
      read(file),
      /@\/lib\/community|WHATSAPP_GROUP_URL|whatsapp_url|wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com/i,
      `${file} must keep contact and publishing inside the application`,
    );
  }
  const center = read('components/admin/MarketingCenter.tsx');
  assert.doesNotMatch(center, /saveMarketingChannel|setMarketingChannelActive/);
  assert.match(center, /مسار المحتوى/);
});

test('campaign attribution is anonymous and survives safe in-app navigation', () => {
  const client = read('lib/analytics/client.ts');
  const endpoint = read('app/api/analytics-events/route.ts');
  assert.match(client, /window\.sessionStorage/);
  assert.match(client, /campaignKey: getCampaignKey\(\)/);
  assert.match(endpoint, /campaignKey: z\.string/);
  assert.match(endpoint, /record_site_analytics_v2/);
  assert.doesNotMatch(client, /marketing_channels|whatsapp_url/);
});
