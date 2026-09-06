import { Card } from '@heroui/react/card';
import { randomUUID } from 'node:crypto';
import Image from 'next/image';
import { formatMarketplaceMoney } from '@/components/marketplace/format';
import { createMarketplaceSupportThreadAction, createPartialMarketplaceReturnAction, receivePartialMarketplaceReturnAction, reviewPartialMarketplaceReturnAction, submitMarketplaceReviewAction, transitionMarketplaceOrderAction } from '@/lib/commerce/operations-actions';
import type { MarketplaceOrderDetail, MarketplaceOrderStatus } from '@/lib/commerce/operations';
import { marketplaceStatusLabels } from './order-status';
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
    result.push({ next: 'confirmed', label: 'تأكيد الطلب' }, { next: 'rejected', label: 'رفض الطلب', needsReason: true, danger: true });
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

function message(code?: string) {
  const messages: Record<string, string> = {
    return_requested: 'تم إرسال طلب الإرجاع للمراجعة.',
    return_approved: 'تمت الموافقة على طلب الإرجاع.',
    return_rejected: 'تم رفض طلب الإرجاع مع حفظ السبب.',
    return_received: 'تم تسجيل استلام المرتجع وتطبيق التسوية المالية والمخزنية.',
    return_quantity_exceeded: 'الكمية المطلوبة تتجاوز الكمية المتبقية القابلة للإرجاع.',
    return_category_excluded: 'سياسة فئة هذا المنتج لا تسمح بهذا النوع من الإرجاع.',
    return_request_failed: 'تعذر إنشاء طلب الإرجاع. راجع السبب والكميات والمدة المتاحة.',
    return_review_failed: 'تعذر حفظ قرار الإرجاع.',
    return_receive_failed: 'تعذر استلام المرتجع أو تسويته.',
    status_updated: 'تم تحديث حالة الطلب.',
    review_saved: 'تم حفظ تقييمك.',
    reason_required: 'اكتب سبب الإجراء أولاً.',
    return_window_expired: 'انتهت مدة الإرجاع المتاحة لهذا الطلب.',
    delivery_proof_required: 'يجب رفع إثبات التسليم قبل إغلاق الطلب.',
    cod_amount_mismatch: 'مبلغ التحصيل لا يطابق قيمة الطلب.',
    transition_not_allowed: 'هذا الإجراء غير متاح لحالة الطلب الحالية.',
    verified_purchase_required: 'التقييم متاح فقط بعد تسليم المنتج.',
    review_already_exists: 'تم تسجيل تقييم لهذا المنتج بالفعل. حدّث الصفحة لعرضه.',
    service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
  };
  return code ? messages[code] : undefined;
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
            <div><strong>{item.productName}</strong><p className={styles.meta}>المتاح: {remaining} · تغيير الرأي حتى {formatDeadline(item.changeOfMindDeadline)} · العيوب حتى {formatDeadline(item.defectDeadline)}</p></div>
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
            return <li key={returnItem.orderItemId}>{orderItem?.productName ?? 'منتج'} — الكمية: {returnItem.quantity}</li>;
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
  return (
    <div className={styles.page}>
      {createReturnPanel}
      {returnHistoryPanel}
      {message(notice) ? <p role="status" className={styles.notice}>{message(notice)}</p> : null}
      {message(error) ? <p role="alert" className={styles.error}>{message(error)}</p> : null}
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{order.storeName}</p><h1 className={styles.title}>طلب <bdi dir="ltr">{order.publicCode}</bdi></h1><p className={styles.subtitle}>الدفع نقدًا عند الاستلام · {marketplaceStatusLabels[order.status]}</p></div>
        <span className={styles.status}>{marketplaceStatusLabels[order.status]}</span>
      </header>

      <Card.Root className={styles.card}><Card.Content className={styles.cardContent}>
        <div className={styles.items}>
          {order.items.map((item) => <article key={item.id} className={styles.item}>
            {item.imageUrl ? <Image className={styles.image} src={item.imageUrl} alt={item.productName} width={64} height={64} /> : <div className={styles.image} aria-hidden="true" />}
            <div><strong>{item.productName}</strong>{item.variantName ? <p className={styles.meta}>{item.variantName}</p> : null}<p className={styles.meta}>الكمية: {item.quantity}</p></div>
            <strong>{formatMarketplaceMoney({ amountMinor: item.lineTotalMinor, currency: 'EGP' })}</strong>
          </article>)}
        </div>
        <div className={styles.summary}>
          <div className={styles.summaryLine}><span>المنتجات</span><strong>{formatMarketplaceMoney({ amountMinor: order.subtotalMinor, currency: 'EGP' })}</strong></div>
          {order.discountMinor > 0 ? <div className={styles.summaryLine}><span>الخصم</span><strong>− {formatMarketplaceMoney({ amountMinor: order.discountMinor, currency: 'EGP' })}</strong></div> : null}
          <div className={styles.summaryLine}><span>التوصيل</span><strong>{formatMarketplaceMoney({ amountMinor: order.deliveryFeeMinor, currency: 'EGP' })}</strong></div>
          <div className={styles.summaryLine}><span>الإجمالي عند الاستلام</span><strong>{formatMarketplaceMoney({ amountMinor: order.grandTotalMinor, currency: 'EGP' })}</strong></div>
        </div>
      </Card.Content></Card.Root>

      {!order.address.redacted && order.address.addressLine ? <Card.Root className={styles.card}><Card.Content className={styles.cardContent}>
        <h2>بيانات الاستلام</h2>
        {order.address.recipientName ? <p><strong>المستلم:</strong> {order.address.recipientName}</p> : null}
        <p><strong>العنوان:</strong> {order.address.addressLine}</p>
        {[order.address.building && `مبنى ${order.address.building}`, order.address.floor && `الدور ${order.address.floor}`, order.address.apartment && `شقة ${order.address.apartment}`, order.address.landmark].filter(Boolean).length > 0 ? <p className={styles.meta}>{[order.address.building && `مبنى ${order.address.building}`, order.address.floor && `الدور ${order.address.floor}`, order.address.apartment && `شقة ${order.address.apartment}`, order.address.landmark].filter(Boolean).join(' · ')}</p> : null}
        {showRecipientPhone && order.address.recipientPhone ? <p><strong>رقم التواصل للتسليم:</strong> <bdi dir="ltr">{order.address.recipientPhone}</bdi></p> : null}
        {order.deliveryNotes ? <p><strong>ملاحظات:</strong> {order.deliveryNotes}</p> : null}
      </Card.Content></Card.Root> : null}

      {role === 'driver' && order.deliveryMode === 'platform' && order.status === 'out_for_delivery' && !order.delivery?.proofAvailable
        ? <DeliveryProofUploader orderId={order.id} /> : null}
          {order.delivery?.proofAvailable && order.delivery.proofAssetId
        ? <p><a className={styles.link} href={`/api/media/assets/${order.delivery.proofAssetId}/view`} target="_blank" rel="noreferrer">عرض إثبات التسليم الخاص</a></p>
            : null}

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

      {role !== 'driver' ? <section className={styles.panel} aria-labelledby="support-title"><h2 id="support-title">تحتاج مساعدة؟</h2><form className={styles.form} action={createMarketplaceSupportThreadAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="storeId" value={order.storeId} /><input type="hidden" name="returnTo" value={returnTo} /><label className={styles.label}>الموضوع<input className={styles.field} name="subject" required minLength={3} maxLength={160} /></label><label className={styles.label}>الرسالة<textarea className={styles.field} name="message" required maxLength={5000} rows={3} /></label><button className={styles.button}>فتح محادثة دعم داخل الموقع</button></form></section> : null}

      {availableTransitions.length > 0 ? <section aria-labelledby="actions-title" className={styles.cardContent}><h2 id="actions-title">الإجراءات المتاحة</h2><div className={styles.actions}>
        {availableTransitions.map((transition) => <form action={transitionMarketplaceOrderAction} className={styles.form} key={transition.next}>
          <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="next" value={transition.next} /><input type="hidden" name="returnTo" value={returnTo} />
          {transition.next === 'delivered' ? <input type="hidden" name="collectedAmountMinor" value={String(order.grandTotalMinor)} /> : null}
          {transition.needsReason ? <label className={styles.label}>السبب<textarea className={styles.field} name="reason" required maxLength={1000} rows={2} /></label> : null}
          <button className={`${styles.button} ${transition.danger ? styles.danger : ''}`} type="submit">{transition.label}</button>
        </form>)}
      </div></section> : null}

      {role === 'customer' && order.status === 'delivered' ? <section aria-labelledby="reviews-title"><h2 id="reviews-title">تقييم المنتجات</h2><p className={styles.subtitle}>لن يظهر قسم التقييم على المنتج قبل وجود تقييمات منشورة.</p><div className={styles.reviewGrid}>{order.items.map((item) => item.review ? <div className={styles.form} key={item.id}><strong>{item.productName}</strong><p>تم حفظ تقييمك: {item.review.rating} من 5</p>{item.review.title ? <p className={styles.meta}>{item.review.title}</p> : null}</div> : <form action={submitMarketplaceReviewAction} className={styles.form} key={item.id}>
        <strong>{item.productName}</strong><input type="hidden" name="orderItemId" value={item.id} /><input type="hidden" name="returnTo" value={returnTo} />
        <label className={styles.label}>التقييم<select className={styles.field} name="rating" required defaultValue="5"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — مقبول</option><option value="1">1 — سيئ</option></select></label>
        <label className={styles.label}>عنوان مختصر<input className={styles.field} name="title" maxLength={120} /></label>
        <label className={styles.label}>تفاصيل التقييم<textarea className={styles.field} name="body" maxLength={2000} rows={3} /></label>
        <button className={styles.button} type="submit">حفظ التقييم</button>
      </form>)}</div></section> : null}

      {order.events.length > 0 ? <section aria-labelledby="timeline-title"><h2 id="timeline-title">سجل الطلب</h2><ol className={styles.timeline}>{order.events.map((event) => <li key={event.id} className={styles.timelineItem}><strong>{event.toStatus ? marketplaceStatusLabels[event.toStatus] : event.type}</strong><p className={styles.meta}>{new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}</p></li>)}</ol></section> : null}
    </div>
  );
}
