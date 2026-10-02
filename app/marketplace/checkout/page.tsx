import { MarketplaceCodCheckout } from '@/components/marketplace/checkout-form';
import { redirect } from 'next/navigation';
import { MarketplaceNotice } from '@/components/marketplace/marketplace-notice';
import { MarketplaceStatePanel } from '@/components/marketplace/state-panel';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { submitMarketplaceCheckoutAction } from '@/app/marketplace/actions';
import { loadMarketplaceCheckout } from '@/lib/commerce/checkout';
import { logSafeServerFailure } from '@/lib/observability/server-log';

export const dynamic = 'force-dynamic';

const errors: Record<string, string> = {
  cart_invalid: 'تغيّر سعر أو مخزون أحد المنتجات. راجع السلة قبل المحاولة مرة أخرى.',
  captcha_invalid: 'انتهى التحقق الآمن أو لم يكتمل. أعد التحقق ثم حاول مرة أخرى.',
  captcha_unavailable: 'خدمة التحقق الآمن غير متاحة الآن. حاول مرة أخرى بعد قليل.',
  cod_limit_reached: 'لا يمكن إنشاء طلب دفع عند الاستلام جديد حاليًا. أكمل طلبك المفتوح أولًا أو حاول لاحقًا.',
  delivery_unavailable: 'خيار التوصيل المحدد لم يعد متاحًا لهذه السلة. راجع المنطقة وطريقة التوصيل.',
  invalid_form: 'راجع بيانات التوصيل وتأكد من اكتمال الحقول المطلوبة.',
  service_unavailable: 'تعذر تأكيد الطلب الآن. لم يتم إنشاء طلب غير مؤكد؛ حاول مرة أخرى.',
};

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function MarketplaceCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, checkout] = await Promise.all([
    searchParams,
    loadMarketplaceCheckout(),
  ]);

  if (checkout.kind === 'claim_required') {
    redirect('/marketplace/cart/claim?next=%2Fmarketplace%2Fcheckout');
  }

  if (checkout.kind === 'empty') {
    return (
      <MarketplaceStatePanel
        title="لا يوجد طلب لإتمامه"
        description="أضف منتجات متاحة إلى السلة أولًا، ثم راجعها قبل إدخال عنوان التوصيل والدفع عند الاستلام."
        actionHref="/marketplace/cart"
        actionLabel="الذهاب إلى السلة"
      />
    );
  }

  if (!checkout.model.requiresAuthentication && checkout.model.deliveryZones.length === 0) {
    return (
      <MarketplaceStatePanel
        title="التوصيل غير متاح لهذه السلة"
        description="لا توجد منطقة واحدة تخدم كل المتاجر الموجودة في السلة. احذف بعض المنتجات أو غيّر محتوى السلة."
        actionHref="/marketplace/cart"
        actionLabel="مراجعة السلة"
      />
    );
  }

  const error = errors[single(params.error)];
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!checkout.model.requiresAuthentication && !turnstileSiteKey) {
    // The order RPC is never reachable without the human check, so fail closed
    // with a recoverable page instead of crashing into the error boundary.
    logSafeServerFailure('error', 'marketplace_checkout_captcha_unconfigured', {
      failure: 'captcha_site_key_missing',
    });
    return (
      <MarketplaceStatePanel
        kind="error"
        title="إتمام الطلب غير متاح مؤقتًا"
        description="سلتك محفوظة كما هي. نعمل على إعادة تفعيل تأكيد الطلبات، حاول مرة أخرى بعد قليل أو تواصل مع المتجر مباشرة."
        actionHref="/marketplace/cart"
        actionLabel="العودة إلى السلة"
      />
    );
  }
  const model = checkout.model.requiresAuthentication || !turnstileSiteKey
    ? checkout.model
    : {
        ...checkout.model,
        captchaSlot: (
          <TurnstileWidget
            action="marketplace_checkout"
            siteKey={turnstileSiteKey}
          />
        ),
      };

  return (
    <>
      {error ? <MarketplaceNotice tone="danger">{error}</MarketplaceNotice> : null}
      <MarketplaceCodCheckout
        key={crypto.randomUUID()}
        model={model}
        idempotencyKey={crypto.randomUUID()}
        submitOrderAction={submitMarketplaceCheckoutAction}
      />
    </>
  );
}
