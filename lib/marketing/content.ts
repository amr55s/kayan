import type {
  Driver,
  MarketingEntityType,
  MarketingTemplateKey,
  Place,
} from '@/types';
import { SITE_NAME, SITE_NAME_AR, SITE_TAGLINE } from '@/lib/brand';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://kayan-hazel.vercel.app';

export const marketingTemplateLabels: Record<MarketingTemplateKey, string> = {
  new_place: 'مكان جديد',
  new_driver: 'كابتن جديد',
  weekly_roundup: 'تجميعة الأسبوع',
  merchant_invite: 'سجّل محلك مجانًا',
  driver_invite: 'انضم ككابتن',
  missing_service: 'خدمة مش موجودة؟',
  data_correction: 'ساعدنا نصحح البيانات',
  local_ambassadors: 'كن سفير ديرتك',
  general_site: 'عرّف جيرانك بالموقع',
};

export const marketingIdeas: Array<{
  key: MarketingTemplateKey;
  title: string;
  description: string;
  path: string;
}> = [
  {
    key: 'general_site',
    title: 'كل احتياجات المنطقة في رابط واحد',
    description: 'رسالة تعريفية مناسبة لمشاركة رابط الموقع.',
    path: '/marketplace',
  },
  {
    key: 'weekly_roundup',
    title: 'تجميعة الأسبوع',
    description: 'ذكّر السكان بأحدث الأماكن والكباتن كل أسبوع.',
    path: '/share',
  },
  {
    key: 'merchant_invite',
    title: 'عندك محل أو خدمة؟',
    description: 'دعوة أصحاب الأنشطة لفتح لوحة التاجر وإدارة الطلبات.',
    path: '/login',
  },
  {
    key: 'driver_invite',
    title: 'انضم ككابتن توصيل',
    description: 'دعوة الكباتن لاستخدام لوحة المهام داخل الموقع.',
    path: '/login',
  },
  {
    key: 'missing_service',
    title: 'مش لاقي خدمة؟',
    description: 'اطلب من السكان إضافة المكان الناقص ليستفيد الجميع.',
    path: '/guide#corrections',
  },
  {
    key: 'data_correction',
    title: 'معلومة اتغيرت؟',
    description: 'شجّع السكان على اقتراح التصحيح بدل تداول بيانات قديمة.',
    path: '/guide#corrections',
  },
  {
    key: 'local_ambassadors',
    title: 'كن سفير ديرتك في عمارتك',
    description: 'شارك QR في المدخل أو مع جيرانك ومحلاتك المعتادة.',
    path: '/share',
  },
];

function withRef(path: string, campaignCode?: string): string {
  const url = new URL(path, SITE_URL);
  if (campaignCode) url.searchParams.set('ref', campaignCode);
  return url.toString();
}

export function entityPath(type: MarketingEntityType, id?: string | null): string {
  if (type === 'place') {
    const suffix = id ? `?place=${encodeURIComponent(id)}` : '';
    return `/services${suffix}`;
  }
  if (type === 'driver') return '/guide';
  return '/marketplace';
}

export function marketingUrl(
  type: MarketingEntityType,
  id?: string | null,
  campaignCode?: string,
): string {
  return withRef(entityPath(type, id), campaignCode);
}

export function marketingText(input: {
  templateKey: MarketingTemplateKey;
  campaignCode?: string;
  place?: Pick<Place, 'id' | 'title' | 'category'>;
  driver?: Pick<Driver, 'id' | 'name' | 'vehicle_type'>;
}): string {
  const { templateKey, campaignCode, place, driver } = input;
  if (place) {
    return [
      `✨ جديد على ${SITE_NAME_AR}: ${place.title}`,
      'شوف الصور والتفاصيل وابدأ طلبك من داخل الموقع.',
      marketingUrl('place', place.id, campaignCode),
    ].join('\n');
  }
  if (driver) {
    return [
      `🛵 كابتن جديد على ${SITE_NAME_AR}: ${driver.name || 'كابتن توصيل'}`,
      `${driver.vehicle_type || 'خدمة توصيل داخل المنطقة'} — تابع المهام والخدمة من داخل ديرتك.`,
      marketingUrl('driver', driver.id, campaignCode),
    ].join('\n');
  }

  const idea = marketingIdeas.find((item) => item.key === templateKey);
  const url = withRef(idea?.path || '/', campaignCode);
  const messages: Partial<Record<MarketingTemplateKey, string[]>> = {
    general_site: [
      `📍 ${SITE_NAME} — ${SITE_TAGLINE}`,
      'متجر ودليل محلي للمطاعم والمحلات والخدمات، والطلب والمتابعة من داخل الموقع.',
    ],
    weekly_roundup: [
      `📅 اكتشف الجديد هذا الأسبوع على ${SITE_NAME_AR}`,
      'أماكن وخدمات وكباتن قريبين منك في رابط واحد.',
    ],
    merchant_invite: [
      '🏪 عندك محل أو خدمة داخل المنطقة؟',
      `أضف نشاطك على ${SITE_NAME_AR} واعرض منتجاتك وصورك وتابع الطلبات من لوحة التاجر.`,
    ],
    driver_invite: [
      '🛵 شغال كابتن توصيل داخل المنطقة؟',
      `انضم إلى ${SITE_NAME_AR} واستقبل المهام وتابع حالتها من لوحة الكابتن.`,
    ],
    missing_service: [
      '🔎 مش لاقي مكان أو خدمة على الدليل؟',
      'ساعد جيرانك وأضفها في دقائق؛ البيانات تمر بالمراجعة قبل النشر.',
    ],
    data_correction: [
      '✏️ معلومة اتغيرت أو محتاجة تصحيح؟',
      `ابعث اقتراحك من ${SITE_NAME_AR} علشان تفضل بيانات المنطقة دقيقة.`,
    ],
    local_ambassadors: [
      '🤝 خليك سفير ديرتك في عمارتك',
      'شارك الرابط أو QR مع جيرانك ومحلاتك المفضلة وساعدنا نبني دليل المنطقة معًا.',
    ],
  };
  return [...(messages[templateKey] || messages.general_site || []), url].join('\n');
}

export function marketingCardTitle(input: {
  templateKey: MarketingTemplateKey;
  place?: Pick<Place, 'title'>;
  driver?: Pick<Driver, 'name'>;
}): string {
  return input.place?.title
    || input.driver?.name
    || marketingTemplateLabels[input.templateKey];
}
