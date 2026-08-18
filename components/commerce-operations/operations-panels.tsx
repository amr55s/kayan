import Link from 'next/link';
import { formatMarketplaceMoney } from '@/components/marketplace/format';
import {
  createCashReconciliationAction,
  moderateMarketplaceEntityAction,
  respondToMarketplaceDeliveryOfferAction,
  reviewCashReconciliationAction,
} from '@/lib/commerce/operations-actions';
import type {
  AdminMarketplaceCommissionStatement,
  MarketplaceCodCollection,
  MarketplaceCommissionStatement,
  MarketplaceDeliveryOffer,
  MarketplaceModerationItem,
  MarketplaceReconciliation,
  MarketplaceSupportThreadSummary,
} from '@/lib/commerce/operations';
import styles from './commerce-operations.module.css';

export function ModerationQueue({ items, returnTo }: { items: MarketplaceModerationItem[]; returnTo: string }) {
  return <section className={styles.panel}><h2>قائمة المراجعة</h2>{items.length === 0 ? <p className={styles.meta}>لا توجد عناصر معلّقة.</p> : <div className={styles.list}>{items.map((item) => <article className={styles.cardContent} key={`${item.entity_type}:${item.id}`}><div><strong>{item.name}</strong><p className={styles.meta}>{item.entity_type === 'product' ? 'منتج' : 'متجر'} · {new Date(item.submitted_at).toLocaleString('ar-EG')}</p></div><div className={styles.actions}>{[true, false].map((approve) => <form action={moderateMarketplaceEntityAction} key={String(approve)}><input type="hidden" name="entityType" value={item.entity_type} /><input type="hidden" name="entityId" value={item.id} /><input type="hidden" name="approve" value={String(approve)} /><input type="hidden" name="returnTo" value={returnTo} /><input className={styles.field} name="notes" maxLength={1000} placeholder={approve ? 'ملاحظات اختيارية' : 'سبب الرفض'} required={!approve} /><button className={`${styles.button} ${approve ? '' : styles.danger}`} type="submit">{approve ? 'اعتماد' : 'رفض'}</button></form>)}</div></article>)}</div>}</section>;
}

export function DeliveryOffers({ items, returnTo }: { items: MarketplaceDeliveryOffer[]; returnTo: string }) {
  return <section className={styles.panel}><h2>عروض التوصيل</h2>{items.length === 0 ? <p className={styles.meta}>لا توجد عروض متاحة الآن.</p> : <div className={styles.list}>{items.map((offer) => <article className={styles.cardContent} key={offer.id}><div><strong>طلب <bdi dir="ltr">{offer.order_code}</bdi></strong><p className={styles.meta}>{offer.store_name} · {offer.delivery_zone_name} · {offer.package_count} قطعة</p><p>{formatMarketplaceMoney({ amountMinor: Number(offer.delivery_fee_piastres), currency: 'EGP' })}</p></div><div className={styles.actions}>{[true, false].map((accept) => <form action={respondToMarketplaceDeliveryOfferAction} key={String(accept)}><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="accept" value={String(accept)} /><input type="hidden" name="returnTo" value={returnTo} /><button className={`${styles.button} ${accept ? '' : styles.secondary}`} type="submit">{accept ? 'قبول وإسناد الطلب' : 'رفض'}</button></form>)}</div></article>)}</div>}</section>;
}

export function CashOperations({ collections, reconciliations, role, returnTo, detailBase }: { collections: MarketplaceCodCollection[]; reconciliations: MarketplaceReconciliation[]; role: 'driver' | 'admin'; returnTo: string; detailBase: string }) {
  const available = collections.filter((item) => item.status === 'collected');
  return <section className={styles.panel}><h2>تحصيلات الدفع عند الاستلام</h2>{collections.length === 0 ? <p className={styles.meta}>لا توجد تحصيلات.</p> : <div className={styles.list}>{collections.map((item) => <div className={styles.row} key={item.collection_id}><span>طلب <bdi dir="ltr">{item.order_code}</bdi> · {item.status}</span><strong>{formatMarketplaceMoney({ amountMinor: Number(item.amount_piastres), currency: 'EGP' })}</strong></div>)}</div>}
    {role === 'driver' && available.length > 0 ? <form className={styles.form} action={createCashReconciliationAction}><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="idempotencyKey" value={`reconcile-${crypto.randomUUID()}`} />{available.map((item) => <span key={item.collection_id}><input type="hidden" name="collectionId" value={item.collection_id} /><input type="hidden" name="submittedAmount" value={String(item.amount_piastres)} /></span>)}<button className={styles.button}>إنشاء التسوية وإرسالها للمراجعة</button></form> : null}
    <h3>التسويات</h3>{reconciliations.map((batch) => <article className={styles.cardContent} key={batch.id}><div className={styles.row}><span>{batch.status}</span><strong>{formatMarketplaceMoney({ amountMinor: Number(batch.submitted_total_piastres), currency: 'EGP' })}</strong><Link className={styles.link} href={`${detailBase}/${batch.id}`}>التفاصيل</Link></div>{role === 'admin' && batch.status === 'submitted' ? <div className={styles.actions}>{[true, false].map((accept) => <form action={reviewCashReconciliationAction} key={String(accept)}><input type="hidden" name="batchId" value={batch.id} /><input type="hidden" name="accept" value={String(accept)} /><input type="hidden" name="returnTo" value={returnTo} /><input className={styles.field} name="notes" maxLength={1000} placeholder="ملاحظات المراجعة" /><button className={`${styles.button} ${accept ? '' : styles.danger}`}>{accept ? 'قبول التسوية' : 'رفض التسوية'}</button></form>)}</div> : null}</article>)}</section>;
}

export function CommissionStatements({ items, detailBase }: { items: MarketplaceCommissionStatement[]; detailBase: string }) {
  return <section className={styles.panel}><h2>كشف العمولات</h2>{items.length === 0 ? <p className={styles.meta}>لا توجد كشوف حتى الآن.</p> : items.map((item) => <div className={styles.row} key={item.id}><span>{item.period_start} — {item.period_end} · {item.status}</span><span>{formatMarketplaceMoney({ amountMinor: Number(item.gross_piastres), currency: 'EGP' })} / عمولة {formatMarketplaceMoney({ amountMinor: Number(item.commission_piastres), currency: 'EGP' })}</span><Link className={styles.link} href={`${detailBase}/${item.id}`}>التفاصيل</Link></div>)}</section>;
}

export function AdminCommissionStatements({ items }: { items: AdminMarketplaceCommissionStatement[] }) {
  return <section className={styles.panel}><h2>دورة عمولات المنصة</h2>{items.length === 0 ? <p className={styles.meta}>لا توجد كشوف عمولة.</p> : items.map((item) => <article className={styles.cardContent} key={item.id}><div className={styles.row}><div><strong>{item.store_name}</strong><p className={styles.meta}>{item.period_start} — {item.period_end} · {item.status}</p></div><span>المستحق {formatMarketplaceMoney({ amountMinor: Number(item.total_due_piastres), currency: 'EGP' })}</span><Link className={styles.link} href={`/admin/marketplace/commissions/${item.id}`}>مراجعة الكشف</Link></div></article>)}</section>;
}

export function SupportThreads({ items, detailBase }: { items: MarketplaceSupportThreadSummary[]; detailBase: string }) {
  return <section className={styles.panel}><h2>الدعم داخل الموقع</h2>{items.length === 0 ? <p className={styles.meta}>لا توجد محادثات دعم.</p> : items.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.subject}</strong><p className={styles.meta}><bdi dir="ltr">{item.public_code}</bdi> · {item.status}{item.unread_count ? ` · ${item.unread_count} جديد` : ''}</p></div><Link className={styles.link} href={`${detailBase}/${item.id}`}>فتح</Link></div>)}</section>;
}
