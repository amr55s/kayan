import { MarketplaceCodCheckout } from '@/components/marketplace/checkout-form';
import { redirect } from 'next/navigation';
import { MarketplaceStatePanel } from '@/components/marketplace/state-panel';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { submitMarketplaceCheckoutAction } from '@/app/marketplace/actions';
import { loadMarketplaceCheckout } from '@/lib/commerce/checkout';
import { requireServerEnv } from '@/lib/env/server';

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
  const model = checkout.model.requiresAuthentication
    ? checkout.model
    : {
        ...checkout.model,
        captchaSlot: (
          <TurnstileWidget
            action="marketplace_checkout"
            siteKey={requireServerEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY')}
          />
        ),
      };

  return (
    <>
      {error ? (
        <p role="alert" className="mb-5 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900">
          {error}
        </p>
      ) : null}
      <MarketplaceCodCheckout
        key={crypto.randomUUID()}
        model={model}
        idempotencyKey={crypto.randomUUID()}
        submitOrderAction={submitMarketplaceCheckoutAction}
      />
    </>
  );
}
