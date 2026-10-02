import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { formatMarketplaceCount, formatMarketplaceMoney } from '@/components/marketplace/format';
import { describeOrderFee, type MerchantWallet, type WalletEntryType } from '@/lib/commerce/wallet';
import { TopupProofInput } from './topup-proof-input';
import styles from './wallet.module.css';

type FormAction = (form: FormData) => void | Promise<void>;

const egp = (amountMinor: number) => formatMarketplaceMoney({ amountMinor: Math.abs(amountMinor), currency: 'EGP' });
const day = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value));
const dayTime = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const entryLabels: Record<WalletEntryType, string> = {
  topup: 'شحن رصيد',
  order_fee: 'رسم قبول طلب',
  free_order: 'طلب مجاني',
  subscription_order: 'طلب ضمن الاشتراك',
  subscription_purchase: 'شراء اشتراك',
  adjustment: 'تسوية من الإدارة',
};

const topupStatusLabels = { pending: 'قيد المراجعة', approved: 'تمت الإضافة', rejected: 'مرفوض' } as const;

export const walletMessages: Record<string, string> = {
  topup_requested: 'تم إرسال طلب الشحن. يُضاف الرصيد بعد مراجعة التحويل، وتظهر حالته هنا.',
  subscription_started: 'تم تفعيل الاشتراك. طلباتك الآن بدون رسوم حتى نهاية المدة.',
};
export const walletErrors: Record<string, string> = {
  access_denied: 'لا تملك صلاحية إدارة هذه المحفظة.',
  insufficient_balance: 'الرصيد لا يكفي. اشحن المحفظة أولًا.',
  invalid_input: 'راجع المبلغ واسم ورقم صاحب التحويل ثم أعد المحاولة.',
  pending_limit: 'لديك طلبات شحن قيد المراجعة بالفعل. انتظر مراجعتها قبل إرسال طلب جديد.',
  plan_unavailable: 'هذه الباقة لم تعد متاحة.',
  proof_required: 'أرفق لقطة شاشة التحويل.',
  proof_too_large: 'حجم الصورة أكبر من ٣ ميجابايت. اختر صورة أصغر.',
  proof_invalid: 'الملف المرفق ليس صورة JPG أو PNG أو WebP.',
  upload_failed: 'تعذر رفع الصورة. حاول مرة أخرى.',
  schema_unavailable: 'المحفظة غير مفعّلة بعد على هذه البيئة.',
  service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
};

export function MerchantWalletPanel({ wallet, merchants, actions }: {
  wallet: MerchantWallet;
  merchants: Array<{ id: string; name: string }>;
  actions: { requestTopup: FormAction; purchaseSubscription: FormAction };
}) {
  const subscription = wallet.subscription;
  const freeShare = wallet.free_orders_total > 0
    ? Math.min(100, Math.round((wallet.free_orders_used / wallet.free_orders_total) * 100))
    : 100;
  const canAcceptPaidOrder = wallet.balance_piastres >= wallet.fee.fixed_piastres;
  const blocked = !subscription && wallet.free_orders_remaining === 0 && !canAcceptPaidOrder;
  const paymentReady = Boolean(wallet.payment.instapay_handle || wallet.payment.phone);
  const minimumTopup = wallet.fee.minimum_topup_piastres / 100;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{wallet.merchant_name ?? 'المحفظة'}</p>
          <h1 className={styles.title}>المحفظة والرسوم</h1>
          <p className={styles.subtitle}>تدفع رسمًا بسيطًا فقط عندما تقبل طلبًا. الدفع والتوصيل بينك وبين العميل مباشرة.</p>
        </div>
        {merchants.length > 1 ? (
          <nav className={styles.switcher} aria-label="اختيار التاجر">
            {merchants.map((merchant) => (
              <Link
                key={merchant.id}
                href={`/merchant/marketplace/wallet?merchant=${encodeURIComponent(merchant.id)}`}
                data-active={merchant.id === wallet.merchant_id}
              >
                {merchant.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      {blocked ? (
        <p role="alert" className={styles.blocked}>
          رصيدك لا يكفي لقبول طلبات جديدة. الطلبات تصلك لكن لن تستطيع قبولها حتى تشحن المحفظة أو تفعّل اشتراكًا.
        </p>
      ) : null}

      <section className={styles.stats} aria-label="ملخص المحفظة">
        <div className={styles.stat}>
          <span className={styles.statLabel}>الرصيد الحالي</span>
          <strong className={styles.statValue}>{egp(wallet.balance_piastres)}</strong>
          <a href="#topup" className={styles.statLink}>شحن الرصيد</a>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>الطلبات المجانية</span>
          {wallet.free_orders_remaining > 0 ? (
            <strong className={styles.statValue}>
              {formatMarketplaceCount(wallet.free_orders_remaining)}
              <small> متبقية من {formatMarketplaceCount(wallet.free_orders_total)}</small>
            </strong>
          ) : (
            <strong className={styles.statText}>
              {wallet.free_orders_total > 0 ? `انتهت طلباتك المجانية (${formatMarketplaceCount(wallet.free_orders_total)})` : 'غير متاحة حاليًا'}
            </strong>
          )}
          <span className={styles.progress} role="img" aria-label={`استخدمت ${wallet.free_orders_used} من ${wallet.free_orders_total}`}>
            <span style={{ inlineSize: `${freeShare}%` }} />
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>رسم الطلب بعد المجاني</span>
          <strong className={styles.statText}>{describeOrderFee(wallet.fee)}</strong>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>الاشتراك</span>
          {subscription ? (
            <>
              <strong className={styles.statText}>{subscription.plan_name ?? 'اشتراك فعّال'}</strong>
              <span className={styles.statHint}>ينتهي {day(subscription.ends_at)} — طلباتك بدون رسوم</span>
            </>
          ) : (
            <>
              <strong className={styles.statText}>غير مشترك</strong>
              <span className={styles.statHint}>{wallet.plans.length > 0 ? 'الاشتراك يلغي رسم الطلب طوال مدته' : 'لا توجد باقات متاحة حاليًا'}</span>
            </>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="wallet-how-title">
        <h2 id="wallet-how-title">كيف تُحتسب الرسوم؟</h2>
        <ol className={styles.steps}>
          <li><strong>يصلك الطلب</strong> وترى المنتجات ومنطقة التوصيل. بيانات العميل تظهر بعد القبول.</li>
          <li><strong>تقبل الطلب</strong> فيُخصم الرسم من رصيدك مرة واحدة، ويظهر لك اسم العميل ورقمه وعنوانه.</li>
          <li><strong>تتواصل وتوصّل وتحصّل</strong> بنفسك. المنصة لا تأخذ شيئًا من مبلغ الطلب.</li>
        </ol>
        <p className={styles.note}>لا رسوم على الطلب الذي ترفضه أو يلغيه العميل قبل قبولك.</p>
      </section>

      <section className={styles.section} id="topup" aria-labelledby="wallet-topup-title">
        <h2 id="wallet-topup-title">شحن الرصيد</h2>
        {paymentReady ? (
          <>
            <div className={styles.payTo}>
              <p>حوّل المبلغ عبر InstaPay أو المحفظة إلى:</p>
              <dl>
                {wallet.payment.recipient_name ? <div><dt>الاسم</dt><dd>{wallet.payment.recipient_name}</dd></div> : null}
                {wallet.payment.instapay_handle ? <div><dt>عنوان InstaPay</dt><dd><bdi dir="ltr">{wallet.payment.instapay_handle}</bdi></dd></div> : null}
                {wallet.payment.phone ? <div><dt>رقم الهاتف</dt><dd><bdi dir="ltr">{wallet.payment.phone}</bdi></dd></div> : null}
              </dl>
              <p className={styles.note}>بعد التحويل، أرسل البيانات ولقطة الشاشة من هنا. يُضاف الرصيد بعد مراجعة التحويل.</p>
            </div>
            <form action={actions.requestTopup} className={styles.form}>
              <input type="hidden" name="merchantId" value={wallet.merchant_id} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <label className={styles.field}>
                <span>المبلغ المحوَّل (جنيه)</span>
                <input name="amountEgp" type="number" inputMode="decimal" min={minimumTopup} max="100000" step="0.01" required className={styles.input} placeholder={String(minimumTopup)} />
                <small>الحد الأدنى {formatMarketplaceCount(minimumTopup)} جنيه</small>
              </label>
              <label className={styles.field}>
                <span>اسم صاحب التحويل</span>
                <input name="payerName" required minLength={2} maxLength={120} className={styles.input} autoComplete="name" />
              </label>
              <label className={styles.field}>
                <span>الرقم الذي تم التحويل منه</span>
                <input name="payerPhone" required inputMode="tel" dir="ltr" pattern="[0-9+\s\-]{10,20}" className={styles.input} placeholder="01xxxxxxxxx" autoComplete="tel" />
              </label>
              <label className={styles.field}>
                <span>رقم مرجع العملية (اختياري)</span>
                <input name="transferReference" maxLength={80} dir="ltr" className={styles.input} />
              </label>
              <TopupProofInput className={styles.field} inputClassName={styles.input} />
              <div className={styles.formActions}>
                <button type="submit" className={styles.primary}>إرسال طلب الشحن</button>
              </div>
            </form>
          </>
        ) : (
          <p className={styles.empty}>لم تُضف الإدارة بيانات التحويل بعد. تواصل مع إدارة ديرتك لشحن رصيدك.</p>
        )}

        {wallet.topups.length > 0 ? (
          <div className={styles.list}>
            <h3>طلبات الشحن</h3>
            {wallet.topups.map((topup) => (
              <div className={styles.row} key={topup.id}>
                <div>
                  <strong>{egp(topup.amount_piastres)}</strong>
                  <span className={styles.rowMeta}><bdi dir="ltr">{topup.public_code}</bdi> · {dayTime(topup.created_at)}</span>
                  {topup.status === 'rejected' && topup.review_notes ? <span className={styles.rowMeta}>سبب الرفض: {topup.review_notes}</span> : null}
                </div>
                <span className={styles.badge} data-status={topup.status}>{topupStatusLabels[topup.status]}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {wallet.plans.length > 0 ? (
        <section className={styles.section} aria-labelledby="wallet-plans-title">
          <h2 id="wallet-plans-title">الاشتراكات</h2>
          <p className={styles.note}>الاشتراك يُدفع من رصيد المحفظة، وطوال مدته تقبل الطلبات بدون رسم على كل طلب.</p>
          <div className={styles.plans}>
            {wallet.plans.map((plan) => {
              const affordable = wallet.balance_piastres >= plan.price_piastres;
              return (
                <form action={actions.purchaseSubscription} className={styles.plan} key={plan.id}>
                  <input type="hidden" name="merchantId" value={wallet.merchant_id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                  <strong>{plan.name}</strong>
                  <span className={styles.planPrice}>{egp(plan.price_piastres)}</span>
                  <span className={styles.rowMeta}>{formatMarketplaceCount(plan.duration_days)} يومًا{subscription ? ' تُضاف بعد نهاية اشتراكك الحالي' : ''}</span>
                  <button type="submit" className={styles.secondary} disabled={!affordable}>
                    {affordable ? 'اشترك من الرصيد' : 'الرصيد لا يكفي'}
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="wallet-ledger-title">
        <h2 id="wallet-ledger-title">سجل الحركات</h2>
        {wallet.entries.length === 0 ? (
          <p className={styles.empty}>لا توجد حركات بعد. أول حركة تظهر عند قبول أول طلب.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>التاريخ</th><th>الحركة</th><th>المبلغ</th><th>الرصيد بعدها</th></tr></thead>
              <tbody>
                {wallet.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{dayTime(entry.created_at)}</td>
                    <td>
                      {entryLabels[entry.type]}
                      {entry.order_id && entry.order_code ? <> · <Link href={`/merchant/marketplace/orders/${entry.order_id}`}><bdi dir="ltr">{entry.order_code}</bdi></Link></> : null}
                      {entry.type === 'adjustment' && entry.note ? <span className={styles.rowMeta}>{entry.note}</span> : null}
                    </td>
                    <td data-sign={entry.amount_piastres > 0 ? 'plus' : entry.amount_piastres < 0 ? 'minus' : 'zero'}>
                      {entry.amount_piastres === 0 ? 'بدون رسوم' : `${entry.amount_piastres > 0 ? '+' : '−'} ${egp(entry.amount_piastres)}`}
                    </td>
                    <td>{egp(entry.balance_after_piastres)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
