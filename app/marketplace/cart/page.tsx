import { redirect } from 'next/navigation';
import { MarketplaceCart } from '@/components/marketplace/cart-view';
import { MarketplaceNotice } from '@/components/marketplace/marketplace-notice';
import {
  applyMarketplaceCartCouponAction,
  removeMarketplaceCartCouponAction,
  removeMarketplaceCartItemAction,
  updateMarketplaceCartItemAction,
} from '@/app/marketplace/actions';
import { loadMarketplaceCart } from '@/lib/commerce/cart';

export const dynamic = 'force-dynamic';

const notices: Record<string, string> = {
  added: 'تمت إضافة المنتج إلى السلة.',
  coupon_applied: 'تم تطبيق كود الخصم. سيُراجع مجددًا عند تنفيذ الطلب.',
  coupon_removed: 'تمت إزالة كود الخصم.',
  removed: 'تم حذف المنتج من السلة.',
  updated: 'تم تحديث الكمية.',
};

const errors: Record<string, string> = {
  cart_expired: 'انتهت السلة السابقة. أضف المنتجات المطلوبة مرة أخرى.',
  coupon_invalid: 'كود الخصم غير صالح لهذه السلة أو انتهت صلاحيته.',
  invalid_item: 'بيانات المنتج غير صالحة. ارجع إلى صفحة المنتج وحاول مرة أخرى.',
  item_limit: 'وصلت السلة إلى الحد الأقصى لعدد المنتجات.',
  merge_deferred: 'تعذر دمج سلة الزائر الآن. منتجات حسابك ما زالت متاحة، وسنحاول الدمج مرة أخرى لاحقًا.',
  quantity_invalid: 'الكمية المطلوبة غير صالحة أو تتجاوز الحد المتاح.',
  service_unavailable: 'تعذر تحديث السلة الآن. حاول مرة أخرى بعد قليل.',
  variant_unavailable: 'الخيار المطلوب غير متوفر بالكمية المحددة.',
};

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function MarketplaceCartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mergeDeferred = single(params.error) === 'merge_deferred';
  const result = await loadMarketplaceCart({ ignorePendingGuest: mergeDeferred });
  if (result.needsGuestClaim) {
    redirect('/marketplace/cart/claim?next=%2Fmarketplace%2Fcart');
  }
  const notice = notices[single(params.notice)];
  const error = errors[single(params.error)];

  return (
    <>
      {notice ? <MarketplaceNotice tone="success">{notice}</MarketplaceNotice> : null}
      {error ? <MarketplaceNotice tone="danger">{error}</MarketplaceNotice> : null}
      <MarketplaceCart
        model={result.model}
        updateLineAction={updateMarketplaceCartItemAction}
        removeLineAction={removeMarketplaceCartItemAction}
        applyPromoAction={applyMarketplaceCartCouponAction}
        removePromoAction={removeMarketplaceCartCouponAction}
      />
    </>
  );
}
