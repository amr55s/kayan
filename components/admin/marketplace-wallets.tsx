import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { formatMarketplaceCount, formatMarketplaceMoney } from '@/components/marketplace/format';
import { minorToEgp } from '@/lib/commerce/money';
import type { DuplicateMerchantSignal, WalletAdminOverview, WalletTopupStatus } from '@/lib/commerce/wallet';
import dashboard from './marketplace-dashboard.module.css';
import styles from './marketplace-wallets.module.css';

type FormAction = (form: FormData) => void | Promise<void>;

const n = formatMarketplaceCount;
const egp = (amountMinor: number) => formatMarketplaceMoney({ amountMinor, currency: 'EGP' });
const dayTime = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const day = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value));

const statusTabs: Array<{ value: WalletTopupStatus; label: string }> = [
  { value: 'pending', label: 'بانتظار المراجعة' },
  { value: 'approved', label: 'تمت إضافتها' },
  { value: 'rejected', label: 'مرفوضة' },
];

const duplicateKindLabels: Record<DuplicateMerchantSignal['kind'], string> = {
  phone: 'نفس رقم الهاتف',
  store_name: 'نفس اسم المتجر',
  free_orders_reused: 'رقم استُخدم لطلبات مجانية في حساب سابق',
};

export const walletAdminMessages: Record<string, string> = {
  topup_approved: 'تمت إضافة الرصيد إلى محفظة التاجر.',
  topup_rejected: 'تم رفض طلب الشحن مع حفظ السبب.',
  wallet_adjusted: 'تم تسجيل التسوية على المحفظة.',
  settings_saved: 'تم حفظ إعدادات الرسوم وبيانات التحويل.',
  plan_saved: 'تم حفظ باقة الاشتراك.',
};
export const walletAdminErrors: Record<string, string> = {
  access_denied: 'هذه الصفحة لصلاحية المالية فقط.',
  already_reviewed: 'تمت مراجعة هذا الطلب من قبل.',
  insufficient_balance: 'لا يمكن أن يصبح رصيد المحفظة بالسالب.',
  invalid_input: 'راجع القيم المدخلة وحدودها ثم أعد المحاولة.',
  not_found: 'السجل المطلوب غير موجود.',
  notes_required: 'اكتب سبب الرفض (٣ أحرف على الأقل).',
  plan_unavailable: 'الباقة غير موجودة.',
  schema_unavailable: 'قاعدة البيانات لم تُحدَّث بعد إلى نسخة المحفظة.',
  service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
};

export function MarketplaceWalletsAdminView({ overview, status, duplicates, actions }: {
  overview: WalletAdminOverview;
  status: WalletTopupStatus;
  duplicates: DuplicateMerchantSignal[];
  actions: { reviewTopup: FormAction; adjustWallet: FormAction; saveSettings: FormAction; savePlan: FormAction };
}) {
  const { settings } = overview;
  return (
    <>
      <section className={dashboard.card} aria-labelledby="topups-title">
        <h2 id="topups-title">طلبات شحن الرصيد</h2>
        <nav className={dashboard.period} aria-label="حالة الطلبات">
          {statusTabs.map((tab) => (
            <Link key={tab.value} href={`/admin/marketplace/wallets?status=${tab.value}`} data-active={tab.value === status ? 'true' : undefined}>
              {tab.label}
            </Link>
          ))}
        </nav>
        {overview.topups.length === 0 ? <p className={dashboard.empty}>لا توجد طلبات في هذه الحالة.</p> : (
          <div className={styles.list}>
            {overview.topups.map((topup) => (
              <article key={topup.id} className={styles.topup}>
                <div className={styles.topupHead}>
                  <div>
                    <strong className={styles.amount}>{egp(topup.amount_piastres)}</strong>
                    <span className={styles.meta}>{topup.merchant_name} · <bdi dir="ltr">{topup.public_code}</bdi> · {dayTime(topup.created_at)}</span>
                  </div>
                  <a className={styles.secondary} href={`/admin/marketplace/wallets/proofs/${topup.id}`} target="_blank" rel="noreferrer">
                    عرض لقطة التحويل
                  </a>
                </div>
                <dl className={styles.facts}>
                  <div><dt>اسم صاحب التحويل</dt><dd>{topup.payer_name}</dd></div>
                  <div><dt>الرقم المحوَّل منه</dt><dd><bdi dir="ltr">{topup.payer_phone}</bdi></dd></div>
                  {topup.transfer_reference ? <div><dt>مرجع العملية</dt><dd><bdi dir="ltr">{topup.transfer_reference}</bdi></dd></div> : null}
                  {topup.requester_name ? <div><dt>أرسله</dt><dd>{topup.requester_name}</dd></div> : null}
                </dl>
                {topup.payer_phone_other_merchants > 0 ? (
                  <p className={dashboard.warning}>هذا الرقم استُخدم للشحن في {n(topup.payer_phone_other_merchants)} حساب تاجر آخر. راجع تنبيهات التكرار قبل الموافقة.</p>
                ) : null}
                {topup.status === 'pending' ? (
                  <div className={styles.review}>
                    <form action={actions.reviewTopup}>
                      <input type="hidden" name="requestId" value={topup.id} />
                      <input type="hidden" name="approve" value="true" />
                      <p className={styles.meta}>تأكد من وصول المبلغ في حسابك قبل الموافقة؛ الإضافة فورية.</p>
                      <button type="submit" className={styles.primary}>وصل المبلغ — أضف الرصيد</button>
                    </form>
                    <form action={actions.reviewTopup}>
                      <input type="hidden" name="requestId" value={topup.id} />
                      <input type="hidden" name="approve" value="false" />
                      <label className={styles.field}><span>سبب الرفض</span><input name="notes" required minLength={3} maxLength={1000} className={styles.input} /></label>
                      <button type="submit" className={styles.danger}>رفض الطلب</button>
                    </form>
                  </div>
                ) : (
                  <p className={styles.meta}>
                    {topup.status === 'approved' ? 'تمت الإضافة' : 'مرفوض'}{topup.reviewed_at ? ` · ${dayTime(topup.reviewed_at)}` : ''}{topup.review_notes ? ` · ${topup.review_notes}` : ''}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={dashboard.card} id="duplicates" aria-labelledby="duplicates-title">
        <h2 id="duplicates-title">تنبيهات الحسابات المكررة</h2>
        <p className={styles.meta}>حسابات تجار تتشارك رقم هاتف أو اسم متجر. الطلبات المجانية تُحتسب على الرقم نفسه، فالحساب المكرر لا يحصل على حصة جديدة.</p>
        {duplicates.length === 0 ? <p className={dashboard.allClear}>لا توجد حسابات يُشتبه في تكرارها.</p> : (
          <div className={styles.list}>
            {duplicates.map((signal, index) => (
              <article key={`${signal.kind}:${signal.label}:${index}`} className={styles.duplicate}>
                <strong>{duplicateKindLabels[signal.kind]}: <bdi>{signal.label}</bdi></strong>
                <ul>
                  {signal.merchants.map((merchant) => (
                    <li key={merchant.id}>
                      {merchant.name}{merchant.is_active ? '' : ' (موقوف)'} — أُنشئ {day(merchant.created_at)} · استخدم {n(merchant.free_orders_used)} طلبًا مجانيًا
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={dashboard.card} id="settings" aria-labelledby="settings-title">
        <h2 id="settings-title">الرسوم وبيانات التحويل</h2>
        <form action={actions.saveSettings} className={styles.form}>
          <label className={styles.field}><span>رسم ثابت لكل طلب (جنيه)</span><input name="fixedEgp" type="number" min="0" max="1000" step="0.01" required defaultValue={minorToEgp(settings.order_fee_fixed_piastres)} className={styles.input} /></label>
          <label className={styles.field}><span>نسبة من قيمة المنتجات (٪)</span><input name="percent" type="number" min="0" max="20" step="0.01" required defaultValue={(settings.order_fee_percent_bps / 100).toString()} className={styles.input} /></label>
          <label className={styles.field}><span>حد أقصى للرسم (جنيه، اختياري)</span><input name="maxFeeEgp" type="number" min="0" max="10000" step="0.01" defaultValue={settings.order_fee_max_piastres == null ? '' : minorToEgp(settings.order_fee_max_piastres)} className={styles.input} /></label>
          <label className={styles.field}><span>عدد الطلبات المجانية لكل تاجر</span><input name="freeOrders" type="number" min="0" max="1000" step="1" required defaultValue={settings.free_orders_per_merchant} className={styles.input} /></label>
          <label className={styles.field}><span>أقل مبلغ شحن (جنيه)</span><input name="minimumTopupEgp" type="number" min="1" max="100000" step="0.01" required defaultValue={minorToEgp(settings.minimum_topup_piastres)} className={styles.input} /></label>
          <label className={styles.field}><span>اسم مستلم التحويل</span><input name="recipientName" maxLength={120} defaultValue={settings.payment_recipient_name ?? ''} className={styles.input} /></label>
          <label className={styles.field}><span>عنوان InstaPay</span><input name="instapayHandle" maxLength={120} dir="ltr" defaultValue={settings.payment_instapay_handle ?? ''} className={styles.input} placeholder="name@instapay" /></label>
          <label className={styles.field}><span>رقم المحفظة / الهاتف</span><input name="paymentPhone" inputMode="tel" dir="ltr" defaultValue={settings.payment_phone ?? ''} className={styles.input} placeholder="01xxxxxxxxx" /></label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary}>حفظ الإعدادات</button>
            <span className={styles.meta}>التغيير يسري على الطلبات التي تُقبل بعد الحفظ. التاجر لا يستطيع إرسال طلب شحن قبل إضافة عنوان InstaPay أو رقم.</span>
          </div>
        </form>
      </section>

      <section className={dashboard.card} id="plans" aria-labelledby="plans-title">
        <h2 id="plans-title">باقات الاشتراك</h2>
        <p className={styles.meta}>الاشتراك يُخصم من رصيد المحفظة ويلغي رسم الطلب طوال مدته. الباقة غير المفعّلة لا تظهر للتجار.</p>
        <div className={styles.list}>
          {[...overview.plans, null].map((plan) => (
            <form action={actions.savePlan} className={styles.form} key={plan?.id ?? 'new'}>
              {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
              <label className={styles.field}><span>{plan ? 'اسم الباقة' : 'باقة جديدة'}</span><input name="name" required minLength={2} maxLength={80} defaultValue={plan?.name ?? ''} className={styles.input} /></label>
              <label className={styles.field}><span>المدة بالأيام</span><input name="durationDays" type="number" min="1" max="366" required defaultValue={plan?.duration_days ?? 30} className={styles.input} /></label>
              <label className={styles.field}><span>السعر (جنيه)</span><input name="priceEgp" type="number" min="1" max="1000000" step="0.01" required defaultValue={plan ? minorToEgp(plan.price_piastres) : ''} className={styles.input} /></label>
              <label className={styles.check}><input type="checkbox" name="isActive" defaultChecked={plan?.is_active ?? false} /> متاحة للتجار</label>
              <div className={styles.formActions}><button type="submit" className={styles.secondary}>{plan ? 'حفظ الباقة' : 'إضافة الباقة'}</button></div>
            </form>
          ))}
        </div>
      </section>

      <section className={dashboard.card} id="wallets" aria-labelledby="wallets-title">
        <h2 id="wallets-title">محافظ التجار</h2>
        {overview.wallets.length === 0 ? <p className={dashboard.empty}>لا يوجد تجار لديهم متاجر بعد.</p> : (
          <div className={styles.list}>
            {overview.wallets.map((wallet) => (
              <details key={wallet.merchant_id} className={styles.wallet}>
                <summary>
                  <span><strong>{wallet.merchant_name}</strong>{wallet.is_active ? '' : ' (موقوف)'}</span>
                  <span className={styles.walletStats}>
                    <span>الرصيد <strong>{egp(wallet.balance_piastres)}</strong></span>
                    <span>طلبات مقبولة <strong>{n(wallet.accepted_orders)}</strong></span>
                    <span>مجاني مستخدم <strong>{n(wallet.free_orders_used)}</strong></span>
                    <span>رسوم مدفوعة <strong>{egp(wallet.fees_paid_piastres)}</strong></span>
                    {wallet.subscription_ends_at && new Date(wallet.subscription_ends_at) > new Date() ? <span>مشترك حتى <strong>{day(wallet.subscription_ends_at)}</strong></span> : null}
                  </span>
                </summary>
                <form action={actions.adjustWallet} className={styles.form}>
                  <input type="hidden" name="merchantId" value={wallet.merchant_id} />
                  <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                  <label className={styles.field}><span>نوع التسوية</span><select name="direction" className={styles.input} defaultValue="credit"><option value="credit">إضافة رصيد</option><option value="debit">خصم رصيد</option></select></label>
                  <label className={styles.field}><span>المبلغ (جنيه)</span><input name="amountEgp" type="number" min="0.01" max="100000" step="0.01" required className={styles.input} /></label>
                  <label className={styles.field}><span>السبب (يظهر للتاجر)</span><input name="note" required minLength={3} maxLength={500} className={styles.input} /></label>
                  <div className={styles.formActions}><button type="submit" className={styles.secondary}>تسجيل التسوية</button></div>
                </form>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
