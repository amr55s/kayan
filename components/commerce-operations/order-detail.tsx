import { Card } from '@heroui/react/card';
import { randomUUID } from 'node:crypto';
import Image from 'next/image';
import Link from 'next/link';
import { formatMarketplaceCount, formatMarketplaceMoney } from '@/components/marketplace/format';
import { createMarketplaceSupportThreadAction, createPartialMarketplaceReturnAction, receivePartialMarketplaceReturnAction, reviewPartialMarketplaceReturnAction, submitMarketplaceReviewAction, transitionMarketplaceOrderAction } from '@/lib/commerce/operations-actions';
import type { MarketplaceOrderDetail, MarketplaceOrderStatus } from '@/lib/commerce/operations';
import { marketplaceStatusLabels } from './order-status';
import { OperationsFeedback, orderEventTypeLabel } from './operations-copy';
import { DeliveryProofUploader } from './delivery-proof-uploader';
import { ChatEntryButton } from '@/components/marketplace/chat/chat-entry-button';
import styles from './commerce-operations.module.css';

type Role = 'customer' | 'merchant' | 'admin' | 'driver';
type Transition = { next: MarketplaceOrderStatus; label: string; needsReason?: boolean; danger?: boolean };

const returnReasonLabels = {
  change_of_mind: 'تغيير الرأي', defective: 'عيب في المنتج', damaged: 'وصل تالفًا',
  wrong_item: 'منتج غير صحيح', missing_parts: 'أجزاء ناقصة', other: 'سبب آخر',
} as const;
const returnStatusLabels = {
  requested: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض',
  received: 'تم الاستلام ورد المبلغ', cancelled: 'ملغي',
} as const;

function formatDeadline(value: string | null) {
  return value ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value)) : 'غير متاح';
}

function transitions(order: MarketplaceOrderDetail, role: Role): Transition[] {
  const result: Transition[] = [];
  if (role === 'customer') {
    if (['delivered'].includes(order.status)) return result;
    if (order.status === 'pending_confirmation') result.push({ next: 'cancelled', label: 'إلغاء الطلب', needsReason: true, danger: true });
    if (order.status === 'delivered') result.push({ next: 'return_requested', label: 'طلب إرجاع', needsReason: true });
    return result;
  }
  const merchantLike = role === 'merchant' || role === 'admin';
  if (['return_requested', 'return_approved'].includes(order.status)) return result;
  if (merchantLike && order.status === 'pending_confirmation') {
    result.push({ next: 'confirmed', label: 'قبول الطلب' }, { next: 'rejected', label: 'رفض الطلب', needsReason: true, danger: true });
  }
  if (merchantLike && order.status === 'confirmed') result.push({ next: 'preparing', label: 'بدء التجهيز' });
  if (merchantLike && order.status === 'preparing') result.push({ next: 'ready_for_pickup', label: 'جاهز للاستلام' });
  if (merchantLike && ['confirmed', 'preparing'].includes(order.status)) result.push({ next: 'cancelled', label: 'إلغاء الطلب', needsReason: true, danger: true });
  if (merchantLike && order.deliveryMode === 'self' && order.status === 'ready_for_pickup') result.push({ next: 'out_for_delivery', label: 'خرج للتوصيل' });
  if ((merchantLike && order.deliveryMode === 'self' || role === 'driver') && order.status === 'out_for_delivery') {
    if (order.deliveryMode === 'self' || order.delivery?.proofAvailable) result.push({ next: 'delivered', label: 'تأكيد التسليم' });
    result.push({ next: 'delivery_failed', label: 'تعذر التوصيل', needsReason: true, danger: true }, { next: 'issue', label: 'تسجيل مشكلة', needsReason: true });
  }
  if (role === 'driver' && order.status === 'ready_for_pickup') result.push({ next: 'out_for_delivery', label: 'استلام الطلب' });
  if (merchantLike && order.status === 'return_requested') result.push({ next: 'return_approved', label: 'الموافقة على الإرجاع' }, { next: 'delivered', label: 'رفض الإرجاع وإغلاق الطلب' });
  if (merchantLike && order.status === 'return_approved') result.push({ next: 'returned', label: 'تأكيد استلام المرتجع' });
  return result;
}

const progressSteps: MarketplaceOrderStatus[] = [
  'pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered',
];
const progressStepLabels: Partial<Record<MarketplaceOrderStatus, string>> = {
  pending_confirmation: 'تم الطلب', confirmed: 'تأكيد المتجر', preparing: 'التجهيز',
  ready_for_pickup: 'جاهز', out_for_delivery: 'في الطريق', delivered: 'تم التسليم',
};

/** What the person looking at the order should expect or do next. */
function nextStepHint(order: MarketplaceOrderDetail, role: Role): string | null {
  const selfDelivery = order.deliveryMode === 'self';
  if (role === 'customer') {
    const hints: Partial<Record<MarketplaceOrderStatus, string>> = {
      pending_confirmation: 'وصل طلبك للمتجر وننتظر تأكيده. يمكنك إلغاء الطلب قبل التأكيد.',
      confirmed: 'قبل المتجر طلبك وسيبدأ تجهيزه. يمكنك التواصل معه مباشرة من بيانات المتجر بالأسفل.',
      preparing: 'المتجر يجهّز طلبك الآن.',
      ready_for_pickup: selfDelivery ? 'طلبك جاهز وسيخرج مع مندوب المتجر.' : 'طلبك جاهز وننتظر استلام الكابتن له.',
      out_for_delivery: 'طلبك في الطريق. جهّز المبلغ نقدًا للدفع عند الاستلام.',
      delivered: 'تم تسليم الطلب. يمكنك تقييم المنتجات أو طلب إرجاع خلال المدة المتاحة.',
      delivery_failed: 'تعذر توصيل الطلب. تواصل مع المتجر من رسائل الطلب لترتيب إعادة التوصيل.',
      cancelled: 'أُلغي هذا الطلب ولن يُحصَّل منك أي مبلغ.',
      rejected: 'اعتذر المتجر عن تنفيذ هذا الطلب ولن يُحصَّل منك أي مبلغ.',
      issue: 'سُجّلت مشكلة على الطلب وفريق الدعم يتابعها.',
    };
    return hints[order.status] ?? null;
  }
  if (role === 'driver') {
    const hints: Partial<Record<MarketplaceOrderStatus, string>> = {
      ready_for_pickup: 'استلم الطلب من المتجر ثم اضغط «استلام الطلب».',
      out_for_delivery: 'سلّم الطلب وحصّل المبلغ نقدًا، ثم ارفع إثبات التسليم لتتمكن من تأكيد التسليم.',
      delivered: 'تم التسليم. أضف المبلغ المحصَّل إلى تسويتك النقدية من لوحة الكابتن.',
    };
    return hints[order.status] ?? null;
  }
  const hints: Partial<Record<MarketplaceOrderStatus, string>> = {
    pending_confirmation: 'طلب جديد بانتظار قرارك. بيانات العميل وعنوانه تظهر لك فور القبول.',
    confirmed: 'ابدأ تجهيز الطلب.',
    preparing: 'عند انتهاء التجهيز علّم الطلب «جاهز للاستلام».',
    ready_for_pickup: selfDelivery ? 'سلّم الطلب لمندوبك أو لكابتن من دليل ديرتك، ثم علّمه «خرج للتوصيل».' : 'الطلب معروض على كباتن ديرتك وسيستلمه أول من يقبله.',
    out_for_delivery: selfDelivery ? 'بعد التسليم وتحصيل المبلغ اضغط «تأكيد التسليم».' : 'الكابتن في الطريق إلى العميل.',
    delivered: 'اكتمل الطلب.',
  };
  return hints[order.status] ?? null;
}

/** Egyptian mobile (01xxxxxxxxx) as the international number WhatsApp expects. */
function whatsappHref(phone: string): string {
  return `https://wa.me/2${phone.replace(/\D/gu, '')}`;
}

function ContactLinks({ phone, whatsapp }: { phone: string; whatsapp?: string | null }) {
  return <span className={styles.contactLinks}>
    <a className={`${styles.link} ${styles.secondary}`} href={`tel:${phone}`}>اتصال <bdi dir="ltr">{phone}</bdi></a>
    <a className={`${styles.link} ${styles.secondary}`} href={whatsappHref(whatsapp ?? phone)} target="_blank" rel="noreferrer">واتساب</a>
  </span>;
}

export function MarketplaceOrderDetailView({ order, role, returnTo, notice, error }: {
  order: MarketplaceOrderDetail;
  role: Role;
  returnTo: string;
  notice?: string;
  error?: string;
}) {
  const availableTransitions = transitions(order, role);
  const showRecipientPhone = role !== 'merchant' || order.deliveryMode === 'self';
  const merchantLike = role === 'merchant' || role === 'admin';
  const quote = merchantLike && order.status === 'pending_confirmation' ? order.platformFeeQuote : null;
  const feeQuotePanel = quote ? <div className={styles.feeQuote}>
    {quote.subscriptionActive
      ? <p><strong>اشتراكك فعّال:</strong> قبول هذا الطلب بدون رسوم.</p>
      : quote.freeOrdersRemaining > 0
        ? <p><strong>هذا الطلب مجاني.</strong> متبقٍ لك {formatMarketplaceCount(quote.freeOrdersRemaining)} من الطلبات المجانية.</p>
        : <>
          <p>رسم قبول هذا الطلب: <strong>{formatMarketplaceMoney({ amountMinor: quote.feeMinor, currency: 'EGP' })}</strong> · رصيدك: <strong>{formatMarketplaceMoney({ amountMinor: quote.balanceMinor, currency: 'EGP' })}</strong></p>
          {quote.balanceMinor < quote.feeMinor
            ? <p role="alert" className={styles.feeQuoteWarning}>الرصيد لا يكفي لقبول الطلب. <Link href="/merchant/marketplace/wallet">اشحن المحفظة</Link> ثم ارجع لقبوله.</p>
            : null}
        </>}
    <p className={styles.meta}>الرسم يُخصم عند القبول فقط؛ الرفض أو إلغاء العميل قبل القبول بلا رسوم.</p>
  </div> : null;
  const returnableItems = order.items.filter((item) => item.returnedQuantity < item.quantity);
  const canManageReturns = role === 'merchant' || role === 'admin';
  const chatRoute = role === 'merchant'
    ? '/merchant/marketplace/chat'
    : role === 'driver'
      ? '/driver/marketplace/chat'
      : role === 'admin'
        ? '/admin/marketplace/chat'
        : '/account/chat';
  const mayChatAboutOrder = role !== 'driver' || order.status === 'out_for_delivery';
  const addressExtras = [order.address.building && `مبنى ${order.address.building}`, order.address.floor && `الدور ${order.address.floor}`, order.address.apartment && `شقة ${order.address.apartment}`, order.address.landmark].filter(Boolean);
  const createReturnPanel = role === 'customer' && order.status === 'delivered' && returnableItems.length > 0 ? (
    <section className={styles.panel} aria-labelledby="partial-return-title">
      <h2 id="partial-return-title">طلب إرجاع جزئي</h2>
      <p className={styles.subtitle}>اختر كمية كل منتج. تغيير الرأي متاح عادةً خلال 14 يومًا، والعيوب خلال 30 يومًا، مع تطبيق استثناءات الفئة.</p>
      <form action={createPartialMarketplaceReturnAction} className={styles.form}>
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <label className={styles.label}>سبب الإرجاع<select className={styles.field} name="reasonCode" required defaultValue="change_of_mind">
          {Object.entries(returnReasonLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
        <label className={styles.label}>تفاصيل إضافية<textarea className={styles.field} name="reasonDetails" maxLength={1000} rows={3} /></label>
        <div className={styles.items}>{returnableItems.map((item) => {
          const remaining = item.quantity - item.returnedQuantity;
          return <article className={styles.item} key={item.id}>
            <div><strong>{item.productName}</strong><p className={styles.meta}>المتاح: {formatMarketplaceCount(remaining)} · تغيير الرأي حتى {formatDeadline(item.changeOfMindDeadline)} · العيوب حتى {formatDeadline(item.defectDeadline)}</p></div>
            <input type="hidden" name="returnItemId" value={item.id} />
            <label className={styles.label}>الكمية<input className={styles.field} name="returnQuantity" type="number" min="0" max={remaining} defaultValue="0" inputMode="numeric" /></label>
          </article>;
        })}</div>
        <button className={styles.button} type="submit">إرسال طلب الإرجاع</button>
      </form>
    </section>
  ) : null;
  const returnHistoryPanel = role !== 'driver' && order.returnRequests.length > 0 ? (
    <section className={styles.panel} aria-labelledby="returns-title">
      <h2 id="returns-title">طلبات الإرجاع</h2>
      <div className={styles.items}>{order.returnRequests.map((request) => (
        <article className={styles.form} key={request.id}>
          <div><strong><bdi dir="ltr">{request.publicCode}</bdi> · {returnStatusLabels[request.status]}</strong>
            <p className={styles.meta}>{returnReasonLabels[request.reasonCode]} · {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(request.createdAt))}</p>
            {request.reasonDetails ? <p>{request.reasonDetails}</p> : null}
            {request.reviewNotes ? <p className={styles.meta}>ملاحظة المراجعة: {request.reviewNotes}</p> : null}
          </div>
          <ul>{request.items.map((returnItem) => {
            const orderItem = order.items.find((item) => item.id === returnItem.orderItemId);
            return <li key={returnItem.orderItemId}>{orderItem?.productName ?? 'منتج'} — الكمية: {formatMarketplaceCount(returnItem.quantity)}</li>;
          })}</ul>
          {request.status === 'received' ? <strong>المبلغ المسترد: {formatMarketplaceMoney({ amountMinor: request.refundAmountMinor, currency: 'EGP' })}</strong> : null}
          {canManageReturns && request.status === 'requested' ? <div className={styles.actions}>
            <form action={reviewPartialMarketplaceReturnAction} className={styles.form}>
              <input type="hidden" name="returnRequestId" value={request.id} /><input type="hidden" name="approve" value="true" />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} /><input type="hidden" name="returnTo" value={returnTo} />
              <label className={styles.label}>ملاحظة اختيارية<textarea className={styles.field} name="notes" maxLength={1000} rows={2} /></label>
              <button className={styles.button} type="submit">الموافقة</button>
            </form>
            <form action={reviewPartialMarketplaceReturnAction} className={styles.form}>
              <input type="hidden" name="returnRequestId" value={request.id} /><input type="hidden" name="approve" value="false" />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} /><input type="hidden" name="returnTo" value={returnTo} />
              <label className={styles.label}>سبب الرفض<textarea className={styles.field} name="notes" required minLength={3} maxLength={1000} rows={2} /></label>
              <button className={`${styles.button} ${styles.danger}`} type="submit">رفض الطلب</button>
            </form>
          </div> : null}
          {canManageReturns && request.status === 'approved' ? <form action={receivePartialMarketplaceReturnAction} className={styles.form}>
            <p className={styles.subtitle}>سجّل فقط الكمية السليمة التي ستعود للمخزون القابل للبيع، واستخدم صفرًا للتالف.</p>
            <input type="hidden" name="returnRequestId" value={request.id} /><input type="hidden" name="idempotencyKey" value={randomUUID()} /><input type="hidden" name="returnTo" value={returnTo} />
            {request.items.map((returnItem) => {
              const orderItem = order.items.find((item) => item.id === returnItem.orderItemId);
              return <label className={styles.label} key={returnItem.orderItemId}>{orderItem?.productName ?? 'منتج'} — كمية تعاد للمخزون
                <input type="hidden" name="restockItemId" value={returnItem.orderItemId} />
                <input className={styles.field} name="restockQuantity" type="number" min="0" max={returnItem.quantity} defaultValue={request.reasonCode === 'change_of_mind' ? returnItem.quantity : 0} required inputMode="numeric" />
              </label>;
            })}
            <label className={styles.label}>ملاحظة الاستلام<textarea className={styles.field} name="notes" maxLength={1000} rows={2} /></label>
            <button className={styles.button} type="submit">تأكيد الاستلام والتسوية</button>
          </form> : null}
        </article>
      ))}</div>
    </section>
  ) : null;
  const listHref = returnTo.slice(0, returnTo.lastIndexOf('/'));
  const progressIndex = progressSteps.indexOf(order.status);
  const hint = nextStepHint(order, role);
  const actionsPanel = availableTransitions.length > 0 ? <section aria-labelledby="actions-title" className={styles.panel}><h2 id="actions-title">الإجراءات المتاحة</h2>{feeQuotePanel}<div className={styles.actions}>
    {availableTransitions.map((transition) => <form action={transitionMarketplaceOrderAction} className={styles.form} key={transition.next}>
      <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="next" value={transition.next} /><input type="hidden" name="returnTo" value={returnTo} />
      {transition.next === 'delivered' ? <input type="hidden" name="collectedAmountMinor" value={String(order.grandTotalMinor)} /> : null}
      {transition.next === 'delivered' ? <p className={styles.meta}>المبلغ المطلوب تحصيله نقدًا: <strong>{formatMarketplaceMoney({ amountMinor: order.grandTotalMinor, currency: 'EGP' })}</strong></p> : null}
      {transition.needsReason ? <label className={styles.label}>السبب<textarea className={styles.field} name="reason" required maxLength={1000} rows={2} /></label> : null}
      <button className={`${styles.button} ${transition.danger ? styles.danger : ''}`} type="submit">{transition.label}</button>
    </form>)}
  </div></section> : null;
  return (
    <div className={styles.page}>
      <Link href={listHref} className={styles.backLink}>→ العودة إلى الطلبات</Link>
      <OperationsFeedback notice={notice} error={error} />
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{order.storeName}</p><h1 className={styles.title}>طلب <bdi dir="ltr">{order.publicCode}</bdi></h1><p className={styles.subtitle}>الدفع نقدًا عند الاستلام · {order.deliveryMode === 'self' ? 'التوصيل عن طريق المتجر' : 'توصيل ديرتك'}{order.deliveryZoneName ? ` · ${order.deliveryZoneName}` : ''}</p></div>
        <span className={styles.status}>{marketplaceStatusLabels[order.status]}</span>
      </header>

      {progressIndex >= 0 ? <ol className={styles.progress} aria-label="مراحل الطلب">
        {progressSteps.map((step, index) => <li key={step} className={`${styles.progressStep} ${index <= progressIndex ? styles.progressDone : ''}`} aria-current={index === progressIndex ? 'step' : undefined}>
          <span className={styles.progressDot} aria-hidden="true" />
          <span>{progressStepLabels[step]}</span>
        </li>)}
      </ol> : null}
      {hint ? <p className={styles.hint}>{hint}</p> : null}

      {role !== 'customer' ? actionsPanel : null}

      <Card.Root className={styles.card}><Card.Content className={styles.cardContent}>
        <div className={styles.items}>
          {order.items.map((item) => <article key={item.id} className={styles.item}>
            {item.imageUrl ? <Image className={styles.image} src={item.imageUrl} alt={item.productName} width={64} height={64} /> : <div className={styles.image} aria-hidden="true" />}
            <div><strong>{item.productName}</strong>{item.variantName ? <p className={styles.meta}>{item.variantName}</p> : null}<p className={styles.meta}>الكمية: {formatMarketplaceCount(item.quantity)}{item.returnedQuantity > 0 ? ` · أُرجع ${formatMarketplaceCount(item.returnedQuantity)}` : ''}</p></div>
            <strong>{formatMarketplaceMoney({ amountMinor: item.lineTotalMinor, currency: 'EGP' })}</strong>
          </article>)}
        </div>
        <div className={styles.summary}>
          <div className={styles.summaryLine}><span>المنتجات</span><strong>{formatMarketplaceMoney({ amountMinor: order.subtotalMinor, currency: 'EGP' })}</strong></div>
          {order.discountMinor > 0 ? <div className={styles.summaryLine}><span>الخصم</span><strong>− {formatMarketplaceMoney({ amountMinor: order.discountMinor, currency: 'EGP' })}</strong></div> : null}
          <div className={styles.summaryLine}><span>التوصيل</span><strong>{formatMarketplaceMoney({ amountMinor: order.deliveryFeeMinor, currency: 'EGP' })}</strong></div>
          <div className={`${styles.summaryLine} ${styles.summaryTotal}`}><span>الإجمالي عند الاستلام</span><strong>{formatMarketplaceMoney({ amountMinor: order.grandTotalMinor, currency: 'EGP' })}</strong></div>
        </div>
      </Card.Content></Card.Root>

      {!order.address.redacted && order.address.addressLine ? <Card.Root className={styles.card}><Card.Content className={styles.cardContent}>
        <h2>بيانات الاستلام</h2>
        {order.address.recipientName ? <p><strong>المستلم:</strong> {order.address.recipientName}</p> : null}
        <p><strong>العنوان:</strong> {order.address.addressLine}</p>
        {addressExtras.length > 0 ? <p className={styles.meta}>{addressExtras.join(' · ')}</p> : null}
        {showRecipientPhone && order.address.recipientPhone ? <p><strong>{role === 'customer' ? 'رقمك للتواصل:' : 'رقم العميل:'}</strong> {role === 'customer' ? <bdi dir="ltr">{order.address.recipientPhone}</bdi> : <ContactLinks phone={order.address.recipientPhone} />}</p> : null}
        {order.deliveryNotes ? <p><strong>ملاحظات:</strong> {order.deliveryNotes}</p> : null}
      </Card.Content></Card.Root> : null}
      {order.address.redacted && !order.accepted && role !== 'customer' ? <Card.Root className={styles.card}><Card.Content className={styles.cardContent}>
        <h2>بيانات الاستلام</h2>
        {order.deliveryZoneName ? <p><strong>منطقة التوصيل:</strong> {order.deliveryZoneName}</p> : null}
        <p className={styles.meta}>اسم العميل ورقمه وعنوانه التفصيلي تظهر هنا بعد قبول الطلب.</p>
      </Card.Content></Card.Root> : null}
      {role === 'customer' && order.accepted && order.storeContact ? <Card.Root className={styles.card}><Card.Content className={styles.cardContent}>
        <h2>تواصل مع المتجر</h2>
        <p className={styles.meta}>قبل المتجر طلبك. تواصل معه مباشرة لترتيب التوصيل أو لأي استفسار.</p>
        <ContactLinks phone={order.storeContact.phone} whatsapp={order.storeContact.whatsapp} />
      </Card.Content></Card.Root> : null}
      {merchantLike && order.platformFee ? <p className={styles.meta}>
        {order.platformFee.type === 'order_fee'
          ? <>رسم المنصة على هذا الطلب: <strong>{formatMarketplaceMoney({ amountMinor: order.platformFee.amountMinor, currency: 'EGP' })}</strong></>
          : order.platformFee.type === 'free_order' ? 'هذا الطلب ضمن طلباتك المجانية — بدون رسوم.' : 'هذا الطلب ضمن اشتراكك — بدون رسوم.'}
      </p> : null}
      {order.delivery?.driverName && role !== 'driver' ? <p className={styles.meta}>الكابتن: {order.delivery.driverName}</p> : null}

      {role === 'driver' && order.deliveryMode === 'platform' && order.status === 'out_for_delivery' && !order.delivery?.proofAvailable
        ? <DeliveryProofUploader orderId={order.id} /> : null}
      {order.delivery?.proofAvailable && order.delivery.proofAssetId
        ? <p><a className={`${styles.link} ${styles.secondary}`} href={`/api/media/assets/${order.delivery.proofAssetId}/view`} target="_blank" rel="noreferrer">عرض إثبات التسليم الخاص</a></p>
        : null}

      {role === 'customer' ? actionsPanel : null}
      {createReturnPanel}
      {returnHistoryPanel}

      {role === 'customer' && order.status === 'delivered' ? <section className={styles.panel} aria-labelledby="reviews-title"><h2 id="reviews-title">تقييم المنتجات</h2><p className={styles.subtitle}>تقييمك يساعد باقي المتسوقين ويظهر على صفحة المنتج.</p><div className={styles.reviewGrid}>{order.items.map((item) => item.review ? <div className={styles.form} key={item.id}><strong>{item.productName}</strong><p>تم حفظ تقييمك: {formatMarketplaceCount(item.review.rating)} من ٥</p>{item.review.title ? <p className={styles.meta}>{item.review.title}</p> : null}</div> : <form action={submitMarketplaceReviewAction} className={styles.form} key={item.id}>
        <strong>{item.productName}</strong><input type="hidden" name="orderItemId" value={item.id} /><input type="hidden" name="returnTo" value={returnTo} />
        <label className={styles.label}>التقييم<select className={styles.field} name="rating" required defaultValue="5"><option value="5">٥ — ممتاز</option><option value="4">٤ — جيد جدًا</option><option value="3">٣ — جيد</option><option value="2">٢ — مقبول</option><option value="1">١ — سيئ</option></select></label>
        <label className={styles.label}>عنوان مختصر<input className={styles.field} name="title" maxLength={120} /></label>
        <label className={styles.label}>تفاصيل التقييم<textarea className={styles.field} name="body" maxLength={2000} rows={3} /></label>
        <button className={styles.button} type="submit">حفظ التقييم</button>
      </form>)}</div></section> : null}

      {mayChatAboutOrder ? <section className={styles.panel} aria-labelledby="order-chat-title">
        <h2 id="order-chat-title">رسائل الطلب</h2>
        <p className={styles.subtitle}>تواصل داخل المنصة بخصوص هذا الطلب، مع حفظ سجل الرسائل للمراجعة عند الحاجة.</p>
        <ChatEntryButton
          intent={{ kind: 'order', orderId: order.id }}
          returnTo={returnTo}
          loginHref={`/signin?next=${encodeURIComponent(returnTo)}`}
          isAuthenticated
          chatRoute={chatRoute}
          label="فتح محادثة الطلب"
        />
      </section> : null}

      {role !== 'driver' ? <section className={styles.panel} aria-labelledby="support-title"><h2 id="support-title">تحتاج مساعدة؟</h2><details className={styles.disclosure}><summary>فتح محادثة مع دعم ديرتك بخصوص هذا الطلب</summary><form className={styles.form} action={createMarketplaceSupportThreadAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="storeId" value={order.storeId} /><input type="hidden" name="returnTo" value={returnTo} /><label className={styles.label}>الموضوع<input className={styles.field} name="subject" required minLength={3} maxLength={160} /></label><label className={styles.label}>الرسالة<textarea className={styles.field} name="message" required maxLength={5000} rows={3} /></label><button className={styles.button}>إرسال إلى الدعم</button></form></details></section> : null}

      {order.events.length > 0 ? <section className={styles.panel} aria-labelledby="timeline-title"><h2 id="timeline-title">سجل الطلب</h2><ol className={styles.timeline}>{order.events.map((event) => <li key={event.id} className={styles.timelineItem}><strong>{event.toStatus ? marketplaceStatusLabels[event.toStatus] : orderEventTypeLabel(event.type)}</strong><p className={styles.meta}>{new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}</p></li>)}</ol></section> : null}
    </div>
  );
}
