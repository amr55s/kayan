import type { MarketplaceCartErrorCode } from './view-models';

export const MARKETPLACE_CART_ERROR_COPY: Record<MarketplaceCartErrorCode, string> = {
  cart_expired: 'انتهت السلة السابقة. أضف المنتجات المطلوبة مرة أخرى.',
  coupon_invalid: 'كود الخصم غير صالح لهذه السلة أو انتهت صلاحيته.',
  invalid_item: 'بيانات المنتج غير صالحة. ارجع إلى صفحة المنتج وحاول مرة أخرى.',
  item_limit: 'وصلت السلة إلى الحد الأقصى لعدد المنتجات.',
  quantity_invalid: 'الكمية المطلوبة غير صالحة أو تتجاوز الحد المتاح.',
  service_unavailable: 'تعذر تحديث السلة الآن. حاول مرة أخرى بعد قليل.',
  variant_unavailable: 'الخيار المطلوب غير متوفر بالكمية المحددة.',
};
