import type { MarketplaceOrderStatus } from '@/lib/commerce/operations';

export const marketplaceStatusLabels: Record<MarketplaceOrderStatus, string> = {
  pending_confirmation: 'بانتظار تأكيد المتجر',
  confirmed: 'تم التأكيد',
  preparing: 'جارٍ التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  out_for_delivery: 'خرج للتوصيل',
  delivery_failed: 'تعذر التوصيل',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  rejected: 'مرفوض',
  issue: 'توجد مشكلة',
  return_requested: 'طلب إرجاع',
  return_approved: 'تمت الموافقة على الإرجاع',
  returned: 'تم الإرجاع',
};
