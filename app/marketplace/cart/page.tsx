import { redirect } from 'next/navigation';
import { MARKETPLACE_CART_ERROR_COPY } from '@/components/marketplace/cart-copy';
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
  ...MARKETPLACE_CART_ERROR_COPY,
  merge_deferred: 'تعذر دمج سلة الزائر الآن. منتجات حسابك ما زالت متاحة، وسنحاول الدمج مرة أخرى لاحقًا.',
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
