import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BRAND_SLOGANS,
  DAILY_THEMES,
  buildDailyPlan,
  buildWeekPlans,
  cairoDateKey,
  cardQuery,
  outreachMessage,
  weekIndex,
} from '../lib/marketing/playbook.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SITE = 'https://example.test';
const REF = /^[a-z0-9_-]{8,64}$/i;

const places = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'مطعم الأول', category: 'restaurants', created_at: '2026-09-01T10:00:00Z' },
  { id: '22222222-2222-4222-8222-222222222222', title: 'صيدلية الحي', category: 'pharmacy', created_at: '2026-09-20T10:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333333', title: 'أكل بيتي', category: 'home_made', created_at: '2026-08-01T10:00:00Z' },
];
const engagement = {
  '22222222-2222-4222-8222-222222222222': { opens: 40, actions: 12 },
  '11111111-1111-4111-8111-111111111111': { opens: 5, actions: 1 },
};

test('the daily plan follows the Cairo calendar and a fixed weekly rhythm', () => {
  // 21:30 UTC on Friday is already Saturday in Cairo.
  assert.equal(cairoDateKey(new Date('2026-10-02T21:30:00Z')), '2026-10-03');
  const saturday = buildDailyPlan({ date: new Date('2026-10-02T21:30:00Z'), siteUrl: SITE, places, engagement });
  assert.equal(saturday.weekday, 6);
  assert.equal(saturday.theme.key, 'spotlight');
  assert.equal(saturday.ref, 'd-20261003-spotlight');

  const week = buildWeekPlans({ date: new Date('2026-10-03T09:00:00Z'), siteUrl: SITE, places, engagement });
  assert.deepEqual(
    week.map((plan) => plan.theme.key),
    ['spotlight', 'fresh', 'category', 'merchant_invite', 'community', 'weekend', 'ambassador'],
  );
  assert.equal(Object.keys(DAILY_THEMES).length, 7);
  assert.equal(weekIndex('2026-10-03'), weekIndex('2026-10-09'));
  assert.equal(weekIndex('2026-10-10'), weekIndex('2026-10-03') + 1);
});

test('every daily post is deterministic, tracked, and renders a valid card request', () => {
  const input = { date: new Date('2026-10-03T09:00:00Z'), siteUrl: SITE, places, engagement };
  for (const plan of buildWeekPlans(input)) {
    assert.match(plan.ref, REF);
    const url = new URL(plan.url);
    assert.equal(url.origin, SITE);
    assert.equal(url.searchParams.get('ref'), plan.ref);
    assert.ok(plan.text.endsWith(plan.url));
    assert.ok(plan.statusText.endsWith(plan.url));
    const query = new URLSearchParams(cardQuery(plan, 'story'));
    assert.equal(query.get('format'), 'story');
    assert.equal(query.get('ref'), plan.ref);
    if (plan.card.type === 'place') {
      assert.equal(query.get('id'), plan.place.id);
      assert.equal(url.searchParams.get('place'), plan.place.id);
    } else {
      assert.equal(query.get('id'), null);
    }
  }
  assert.deepEqual(buildDailyPlan(input), buildDailyPlan(input));
});

test('place themes choose from real directory data and fall back when it is empty', () => {
  const thursday = buildDailyPlan({ date: new Date('2026-10-08T09:00:00Z'), siteUrl: SITE, places, engagement });
  assert.equal(thursday.theme.key, 'weekend');
  assert.ok(['restaurants', 'home_made'].includes(thursday.place.category));

  const monday = buildDailyPlan({ date: new Date('2026-10-05T09:00:00Z'), siteUrl: SITE, places, engagement });
  assert.equal(monday.theme.key, 'category');
  assert.ok(places.some((place) => monday.text.includes(place.title)));

  for (const plan of buildWeekPlans({ date: new Date('2026-10-03T09:00:00Z'), siteUrl: SITE, places: [] })) {
    assert.equal(plan.card.type, 'feature');
    assert.equal(plan.place, undefined);
    assert.match(plan.text, /https:\/\/example\.test\//);
  }
  assert.ok(BRAND_SLOGANS.length >= 6);
});

test('merchant outreach quotes real engagement only when there is some', () => {
  const url = 'https://example.test/guide?ref=o-1111111111111111';
  const withProof = outreachMessage({ placeTitle: 'صيدلية الحي', stats: { opens: 40, actions: 12 }, url });
  assert.match(withProof, /اتفتحت 40 مرة/);
  assert.match(withProof, /12 واحد/);
  assert.ok(withProof.endsWith(url));

  const noProof = outreachMessage({ placeTitle: 'محل جديد', stats: { opens: 0, actions: 0 }, url });
  assert.doesNotMatch(noProof, /اتفتحت/);
  assert.match(noProof, /محل جديد/);

  const followUp = outreachMessage({ placeTitle: 'محل جديد', url, stage: 'follow_up' });
  assert.notEqual(followUp, noProof);
  assert.ok(followUp.endsWith(url));
});

test('direct WhatsApp outreach is confined to the admin-only merchant invite tool', () => {
  const outreach = read('components/admin/marketing/MerchantOutreach.tsx');
  const daily = read('components/admin/marketing/DailyMarketingPlan.tsx');
  const center = read('components/admin/MarketingCenter.tsx');
  const actions = read('lib/marketing/admin-actions.ts');

  assert.match(center, /<DailyMarketingPlan/);
  assert.match(center, /<MerchantOutreach/);
  // The outreach list reads place phone numbers, so it must only ever be
  // mounted from the super-admin marketing center and record through its actions.
  assert.match(outreach, /formatWhatsAppUrl\(row\.number, row\.message\)/);
  assert.match(outreach, /prepareMarketingCampaign/);
  assert.match(outreach, /recordMarketingPublication/);
  assert.match(actions, /requireMarketplaceAdminRole\(\['super_admin'\]/);
  // Group and status posts go through the device share sheet, never a hardcoded link.
  assert.match(daily, /navigator\.share\(/);
  assert.doesNotMatch(daily, /wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|formatWhatsAppUrl/i);
  for (const file of ['app/share/page.tsx', 'components/marketing/PublicShareHub.tsx']) {
    assert.doesNotMatch(read(file), /MerchantOutreach|DailyMarketingPlan/);
  }
});

test('themed and story cards only accept fixed copy', () => {
  const route = read('app/api/marketing-card/route.ts');
  assert.match(route, /theme: z\.enum\(\[/);
  assert.match(route, /format: z\.enum\(\['square', 'story'\]\)\.default\('square'\)/);
  assert.match(route, /placeThemeSubtitles\[theme\]/);
  assert.match(route, /storyCard\(square, renderSize, renderScale\)/);
});

test('card text is drawn from bundled fonts, not system fonts', () => {
  const route = read('app/api/marketing-card/route.ts');
  const config = read('next.config.ts');
  // Serverless hosts have no Arabic system font; SVG <text> renders empty boxes there.
  assert.doesNotMatch(route, /<text x=/);
  assert.match(route, /fontfile: CARD_FONT_FILES\[spec\.weight\]/);
  assert.match(route, /font: `Dairtak Card /);
  assert.match(config, /'\/api\/marketing-card': \['\.\/assets\/fonts\/\*\.ttf'\]/);
  for (const weight of [400, 700]) {
    const font = readFileSync(new URL(`../assets/fonts/DairtakCard-${weight}.ttf`, import.meta.url));
    assert.ok(font.byteLength > 50_000);
  }
});

test('the daily publisher is cron-protected and skips unconfigured channels', () => {
  const route = read('app/api/cron/marketing-daily/route.ts');
  const publisher = read('lib/marketing/auto-publish.ts');
  const vercel = JSON.parse(read('vercel.json'));

  assert.match(route, /timingSafeEqual/);
  assert.match(route, /secret\.length < 32/);
  assert.match(route, /status: 401/);
  assert.match(route, /private, no-store/);
  assert.ok(vercel.crons.some((cron) => cron.path === '/api/cron/marketing-daily'));

  assert.match(publisher, /^import 'server-only';/);
  assert.match(publisher, /TELEGRAM_BOT_TOKEN/);
  assert.match(publisher, /FACEBOOK_PAGE_ACCESS_TOKEN/);
  assert.match(publisher, /status: 'skipped'/);
  assert.doesNotMatch(publisher, /console\.|NEXT_PUBLIC_/);
});
