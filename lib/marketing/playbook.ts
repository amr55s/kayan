import type { MarketingTemplateKey } from '@/types';
import { SITE_NAME_AR } from '../brand.ts';

/**
 * Daily marketing playbook.
 *
 * Everything here is pure and deterministic: the same date and directory data
 * always produce the same plan, so the admin panel and the scheduled publisher
 * agree on "today's post" without storing anything.
 */

export type DailyThemeKey =
  | 'spotlight'
  | 'fresh'
  | 'category'
  | 'merchant_invite'
  | 'community'
  | 'weekend'
  | 'ambassador';

export type PlaybookPlace = {
  id: string;
  title: string;
  category: string;
  created_at: string;
  images?: string[] | null;
};

export type PlaceEngagement = { opens: number; actions: number };

export type DailyPlan = {
  dateKey: string;
  weekday: number;
  theme: { key: DailyThemeKey; label: string; goal: string };
  /** Anonymous campaign code; shows up as `campaign_key` in site analytics. */
  ref: string;
  headline: string;
  /** Full post for the WhatsApp group, Facebook or Telegram. */
  text: string;
  /** Short caption for a WhatsApp Status / story. */
  statusText: string;
  path: string;
  url: string;
  card: {
    type: 'place' | 'feature';
    id?: string;
    template: MarketingTemplateKey;
    theme: DailyThemeKey;
  };
  place?: PlaybookPlace;
};

export const DAILY_THEMES: Record<number, DailyPlan['theme']> = {
  6: { key: 'spotlight', label: 'محل الأسبوع', goal: 'زيارات وطلبات للتاجر الأكثر تفاعلًا' },
  0: { key: 'fresh', label: 'جديد على ديرتك', goal: 'إثبات أن الدليل بيكبر كل أسبوع' },
  1: { key: 'category', label: 'دليل اليوم', goal: 'تعويد السكان يفتحوا الدليل وقت الحاجة' },
  2: { key: 'merchant_invite', label: 'عندك محل؟', goal: 'تجار جدد يفتحوا متجرهم' },
  3: { key: 'community', label: 'ساعدنا نكمّل الدليل', goal: 'أماكن وكباتن جدد من السكان' },
  4: { key: 'weekend', label: 'طلبات الويك إند', goal: 'طلبات أكل وحلويات قبل الإجازة' },
  5: { key: 'ambassador', label: 'عرّف جيرانك', goal: 'مشاركات ومتابعين جدد للجروب' },
};

export const BRAND_SLOGANS = [
  'ديرتك — كل ما تحتاجه في مكان واحد',
  'قبل ما تسأل في الجروب… افتح ديرتك',
  'محلات منطقتك كلها في جيبك',
  'اطلب من جارك، يوصلك أسرع',
  'ديرتك: الدليل اللي عارف منطقتك',
  'رقم أي محل في ثانية — من غير ما تدوّر',
  'بيع لجيرانك أونلاين، وأول طلباتك علينا',
  'من أهل المنطقة… لأهل المنطقة',
] as const;

const CATEGORY_ROTATION: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'restaurants', label: 'المطاعم والكافيهات', emoji: '🍔' },
  { id: 'home_made', label: 'الأكل البيتي', emoji: '👩‍🍳' },
  { id: 'stores', label: 'المحلات', emoji: '🛍️' },
  { id: 'market', label: 'السوبر ماركت', emoji: '🛒' },
  { id: 'veggies', label: 'الخضار والفاكهة', emoji: '🥕' },
  { id: 'pharmacy', label: 'الصيدليات', emoji: '💊' },
  { id: 'crafts', label: 'الصنايعية', emoji: '🔧' },
  { id: 'services', label: 'الخدمات', emoji: '🧰' },
];

const WEEKEND_CATEGORIES = ['restaurants', 'home_made'];
const CAIRO = 'Africa/Cairo';

export function cairoDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

/** Whole weeks since the epoch; advances every Saturday (the local week start). */
export function weekIndex(dateKey: string): number {
  const days = Math.floor(dateFromKey(dateKey).getTime() / 86_400_000);
  return Math.floor((days + 5) / 7);
}

export function trackedUrl(siteUrl: string, path: string, ref: string): string {
  const url = new URL(path, siteUrl);
  url.searchParams.set('ref', ref);
  return url.toString();
}

function pick<T>(items: readonly T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length];
}

function engagementScore(stats?: PlaceEngagement): number {
  return stats ? stats.opens + stats.actions * 3 : 0;
}

function byEngagement(
  places: PlaybookPlace[],
  engagement: Record<string, PlaceEngagement>,
): PlaybookPlace[] {
  return [...places].sort((left, right) =>
    engagementScore(engagement[right.id]) - engagementScore(engagement[left.id])
    || Date.parse(right.created_at) - Date.parse(left.created_at));
}

function placePath(place: PlaybookPlace): string {
  return `/services?place=${encodeURIComponent(place.id)}`;
}

type ThemeDraft = Pick<DailyPlan, 'headline' | 'statusText' | 'path' | 'card' | 'place'> & {
  lines: string[];
};

function featureDraft(
  theme: DailyThemeKey,
  template: MarketingTemplateKey,
  path: string,
  headline: string,
  lines: string[],
  statusText: string,
): ThemeDraft {
  return { headline, lines, statusText, path, card: { type: 'feature', template, theme } };
}

function placeDraft(
  theme: DailyThemeKey,
  place: PlaybookPlace,
  headline: string,
  lines: string[],
  statusText: string,
): ThemeDraft {
  return {
    headline,
    lines,
    statusText,
    path: placePath(place),
    card: { type: 'place', id: place.id, template: 'new_place', theme },
    place,
  };
}

function generalDraft(theme: DailyThemeKey, week: number): ThemeDraft {
  return featureDraft(
    theme,
    'general_site',
    '/services',
    pick(BRAND_SLOGANS, week),
    [
      `📍 ${pick(BRAND_SLOGANS, week)}`,
      'مطاعم، محلات، صيدليات، صنايعية وكباتن توصيل — كلهم من منطقتك وبأرقامهم.',
      'افتح الرابط واحفظه عندك 👇',
    ],
    'كل محلات المنطقة في رابط واحد 👇',
  );
}

function themeDraft(
  theme: DailyThemeKey,
  week: number,
  places: PlaybookPlace[],
  engagement: Record<string, PlaceEngagement>,
): ThemeDraft {
  if (theme === 'spotlight') {
    const ranked = byEngagement(places, engagement);
    const place = ranked.length ? pick(ranked.slice(0, 6), week) : undefined;
    if (!place) return generalDraft(theme, week);
    return placeDraft(theme, place, `محل الأسبوع: ${place.title}`, [
      `⭐ محل الأسبوع على ${SITE_NAME_AR}: ${place.title}`,
      'من أكتر الأماكن اللي جيرانك فتحوها واتواصلوا معاها الأسبوع ده.',
      'شوف الصور والتفاصيل واطلب من هنا 👇',
    ], `⭐ محل الأسبوع: ${place.title}`);
  }

  if (theme === 'fresh') {
    const newest = [...places].sort(
      (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
    );
    const place = newest.length ? pick(newest.slice(0, 4), week) : undefined;
    if (!place) return generalDraft(theme, week);
    return placeDraft(theme, place, `جديد على ديرتك: ${place.title}`, [
      `✨ جديد على ${SITE_NAME_AR}: ${place.title}`,
      'انضم للدليل قريب — افتح صفحته وشوف الصور وطريقة التواصل.',
      'تعرف محل تاني مش موجود؟ ابعته لنا ونضيفه 👇',
    ], `✨ جديد في المنطقة: ${place.title}`);
  }

  if (theme === 'category') {
    const available = CATEGORY_ROTATION.filter(
      (category) => places.some((place) => place.category === category.id),
    );
    if (!available.length) return generalDraft(theme, week);
    const category = pick(available, week);
    const names = byEngagement(
      places.filter((place) => place.category === category.id),
      engagement,
    ).slice(0, 5).map((place) => `• ${place.title}`);
    return featureDraft(theme, 'weekly_roundup', '/services', `دليل ${category.label}`, [
      `${category.emoji} محتاج ${category.label}؟ دول اللي في منطقتك على ${SITE_NAME_AR}:`,
      ...names,
      'الأرقام والصور والتفاصيل كلها هنا 👇',
    ], `${category.emoji} دليل ${category.label} في المنطقة`);
  }

  if (theme === 'merchant_invite') {
    const variants: string[][] = [
      [
        '🏪 عندك محل أو بتبيع من البيت؟',
        `افتح متجرك على ${SITE_NAME_AR}: اعرض منتجاتك بالصور، واستقبل الطلبات على موبايلك.`,
        'التسجيل مجاني، وأول طلباتك من غير أي رسوم 👇',
      ],
      [
        '📦 جيرانك بيدوّروا على اللي بتبيعه… خليهم يلاقوك.',
        `محلك على ${SITE_NAME_AR} = صفحة باسمك + منتجاتك + طلبات جاهزة توصلك.`,
        'ابدأ في 5 دقايق 👇',
      ],
    ];
    return featureDraft(
      theme,
      'merchant_invite',
      '/guide',
      'افتح متجرك على ديرتك',
      pick(variants, week),
      '🏪 عندك محل؟ افتح متجرك مجانًا على ديرتك',
    );
  }

  if (theme === 'community') {
    const variants: Array<[MarketingTemplateKey, string, string[], string]> = [
      ['missing_service', 'مش لاقي خدمة؟', [
        '🔎 دوّرت على محل أو صنايعي ومالقيتوش في الدليل؟',
        'ابعت اسمه ورقمه في دقيقة، ونضيفه بعد المراجعة علشان جيرانك يلاقوه.',
        'ضيف المكان من هنا 👇',
      ], '🔎 مش لاقي خدمة؟ ضيفها للدليل'],
      ['driver_invite', 'انضم ككابتن توصيل', [
        '🛵 بتوصّل طلبات جوه المنطقة؟',
        `سجّل ككابتن على ${SITE_NAME_AR} وخلي المحلات والسكان يوصلولك مباشرة.`,
        'التفاصيل من هنا 👇',
      ], '🛵 كابتن توصيل؟ سجّل على ديرتك'],
      ['data_correction', 'معلومة اتغيرت؟', [
        '✏️ رقم اتغير؟ محل قفل أو نقل؟',
        'صحّح المعلومة في ثواني علشان الدليل يفضل مظبوط لكل الجيران.',
        'ابعت التصحيح من هنا 👇',
      ], '✏️ ساعدنا نخلي الدليل مظبوط'],
    ];
    const [template, headline, lines, statusText] = pick(variants, week);
    return featureDraft(
      theme,
      template,
      template === 'driver_invite' ? '/guide' : '/guide#corrections',
      headline,
      lines,
      statusText,
    );
  }

  if (theme === 'weekend') {
    const food = byEngagement(
      places.filter((place) => WEEKEND_CATEGORIES.includes(place.category)),
      engagement,
    );
    const place = food.length ? pick(food, week) : undefined;
    if (!place) return generalDraft(theme, week);
    return placeDraft(theme, place, `ويك إند مع ${place.title}`, [
      '🍽️ الويك إند جه… هتاكلوا إيه؟',
      `اقتراح النهارده: ${place.title} — المنيو والصور على ${SITE_NAME_AR}.`,
      'اطلب من هنا 👇',
    ], `🍽️ اقتراح الويك إند: ${place.title}`);
  }

  if (week % 2 === 0) return generalDraft(theme, week);
  return featureDraft(theme, 'local_ambassadors', '/share', 'كن سفير ديرتك في عمارتك', [
    '🤝 خليك سفير ديرتك في عمارتك',
    'ابعت الرابط في جروب العمارة، أو اطبع الـ QR وعلّقه في المدخل.',
    'بطاقات جاهزة للمشاركة من هنا 👇',
  ], '🤝 شارك ديرتك مع جيرانك');
}

export function buildDailyPlan(input: {
  date: Date;
  siteUrl: string;
  places: PlaybookPlace[];
  engagement?: Record<string, PlaceEngagement>;
}): DailyPlan {
  const dateKey = cairoDateKey(input.date);
  const weekday = dateFromKey(dateKey).getUTCDay();
  const theme = DAILY_THEMES[weekday];
  const ref = `d-${dateKey.replaceAll('-', '')}-${theme.key}`;
  const draft = themeDraft(theme.key, weekIndex(dateKey), input.places, input.engagement ?? {});
  const url = trackedUrl(input.siteUrl, draft.path, ref);
  return {
    dateKey,
    weekday,
    theme,
    ref,
    headline: draft.headline,
    text: [...draft.lines, url].join('\n'),
    statusText: `${draft.statusText}\n${url}`,
    path: draft.path,
    url,
    card: draft.card,
    place: draft.place,
  };
}

/** The plan for `date` and the six days after it. */
export function buildWeekPlans(input: Parameters<typeof buildDailyPlan>[0]): DailyPlan[] {
  return Array.from({ length: 7 }, (_, offset) => buildDailyPlan({
    ...input,
    date: new Date(input.date.getTime() + offset * 86_400_000),
  }));
}

export function cardQuery(plan: DailyPlan, format: 'square' | 'story' = 'square'): string {
  const params = new URLSearchParams({
    type: plan.card.type,
    template: plan.card.template,
    theme: plan.card.theme,
    ref: plan.ref,
  });
  if (plan.card.id) params.set('id', plan.card.id);
  if (format === 'story') params.set('format', 'story');
  return params.toString();
}

// Keep in sync with the free-order allowance in the wallet settings
// (/admin/marketplace/wallets); see docs/business-model.md.
export const FREE_ORDERS_OFFER = 30;

export type OutreachStage = 'first' | 'follow_up';

/** Direct message to a business that is listed in the directory but has no store yet. */
export function outreachMessage(input: {
  placeTitle: string;
  stats?: PlaceEngagement;
  url: string;
  stage?: OutreachStage;
}): string {
  const { placeTitle, stats, url } = input;
  if (input.stage === 'follow_up') {
    return [
      `أهلًا 👋 بفكّر حضرتك بدعوة ${SITE_NAME_AR} لـ«${placeTitle}».`,
      'فتح المتجر بياخد 5 دقايق، ولو تحب أساعدك أرفع أول منتجات معاك.',
      url,
    ].join('\n');
  }
  const proof = stats && stats.opens > 0
    ? `صفحة «${placeTitle}» اتفتحت ${stats.opens} مرة آخر 30 يوم${
        stats.actions > 0 ? `، و${stats.actions} واحد ضغط يتواصل معاكم` : ''
      }.`
    : `«${placeTitle}» موجود عندنا في دليل المنطقة والسكان بيدوّروا عليه.`;
  return [
    `السلام عليكم 👋 معاك إدارة ${SITE_NAME_AR} — دليل ومتجر المنطقة.`,
    proof,
    `تحب تستقبل طلبات أونلاين؟ افتح متجرك مجانًا، وأول ${FREE_ORDERS_OFFER} طلب من غير أي رسوم.`,
    `التفاصيل والتسجيل: ${url}`,
  ].join('\n');
}
