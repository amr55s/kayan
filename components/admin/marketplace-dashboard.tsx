import Link from 'next/link';
import { formatMarketplaceCount, formatMarketplaceMoney } from '@/components/marketplace/format';
import { marketplaceStatusLabels } from '@/components/commerce-operations/order-status';
import type { MarketplaceOrderStatus } from '@/lib/commerce/operations';
import type { MarketplaceAdminDashboard } from '@/lib/commerce/wallet';
import styles from './marketplace-dashboard.module.css';

const n = formatMarketplaceCount;
const egp = (amountMinor: number) => formatMarketplaceMoney({ amountMinor, currency: 'EGP' });
const percent = (part: number, whole: number) => (whole > 0 ? `${n(Math.round((part / whole) * 100))}٪` : '—');
const shortDay = (value: string) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(new Date(value));
const dayTime = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function bytes(value: number): string {
  if (value < 1024) return `${n(value)} بايت`;
  if (value < 1024 ** 2) return `${n(Math.round(value / 1024))} ك.ب`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toLocaleString('ar-EG', { maximumFractionDigits: 1 })} م.ب`;
  return `${(value / 1024 ** 3).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.ب`;
}

const storeStatusLabels: Record<string, string> = {
  draft: 'مسودة', pending_review: 'قيد المراجعة', published: 'منشور', suspended: 'موقوف', archived: 'مؤرشف',
};
const productStatusLabels: Record<string, string> = {
  draft: 'مسودة', pending_review: 'قيد المراجعة', active: 'منشور', rejected: 'مرفوض', archived: 'مؤرشف',
};
const activityLabels: Record<string, string> = {
  store: 'متجر', restaurant: 'مطعم', service: 'خدمة', real_estate: 'عقار', driver: 'كابتن',
};
const workspaceStatusLabels: Record<string, string> = {
  draft: 'مسودة', pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', suspended: 'موقوف',
};
const bucketLabels: Record<string, string> = {
  'listing-images': 'صور الدليل',
  'driver-avatars': 'صور الكباتن',
  'marketplace-media-public': 'صور منتجات المتجر',
  'marketplace-media-private': 'ملفات خاصة (استيراد وإثباتات)',
  'wallet-topup-proofs': 'لقطات تحويلات الشحن',
};

type Attention = { label: string; count: number; href: string; tone: 'warn' | 'danger' };

function attentionItems(data: MarketplaceAdminDashboard, duplicates: number | null): Attention[] {
  const { revenue, orders, problems, accounts } = data;
  const items: Attention[] = [
    { label: 'طلبات شحن رصيد بانتظار المراجعة', count: revenue.pending_topups, href: '/admin/marketplace/wallets', tone: 'warn' },
    { label: 'طلبات لم يرد عليها المتجر منذ أكثر من ساعتين', count: orders.awaiting_store_over_2h, href: '/admin/marketplace/orders', tone: 'danger' },
    { label: 'متاجر بانتظار المراجعة', count: problems.stores_pending_review, href: '/admin/marketplace/orders', tone: 'warn' },
    { label: 'منتجات بانتظار المراجعة', count: problems.products_pending_review, href: '/admin/marketplace/orders', tone: 'warn' },
    { label: 'طلبات انضمام بانتظار المراجعة', count: accounts.pending_account_requests, href: '/admin', tone: 'warn' },
    { label: 'متاجر منشورة لا تستطيع قبول طلبات (رصيد منتهٍ)', count: revenue.stores_out_of_credit, href: '/admin/marketplace/wallets', tone: 'danger' },
    { label: 'متاجر منشورة بدون رقم تواصل', count: problems.published_stores_without_contact, href: '#stores', tone: 'warn' },
    { label: 'متاجر منشورة بدون منطقة توصيل مفعّلة', count: problems.published_stores_without_delivery, href: '#stores', tone: 'danger' },
    { label: 'حسابات تجار يُشتبه أنها مكررة', count: duplicates ?? 0, href: '/admin/marketplace/wallets#duplicates', tone: 'warn' },
    { label: 'أخطاء ظهرت للمستخدمين آخر ٧ أيام', count: problems.client_errors_7d, href: '#problems', tone: 'warn' },
    { label: 'بلاغات محادثات مفتوحة', count: problems.open_chat_reports, href: '/admin/marketplace/chat', tone: 'warn' },
    { label: 'إشعارات فشل إرسالها نهائيًا', count: problems.push_dead_letters + problems.outbox_dead_letters, href: '#problems', tone: 'warn' },
  ];
  return items.filter((item) => item.count > 0);
}

function CountList({ values, labels }: { values: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(values).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) return <p className={styles.empty}>لا توجد بيانات بعد.</p>;
  return (
    <dl className={styles.countList}>
      {entries.map(([key, value]) => (
        <div key={key}><dt>{labels[key] ?? key}</dt><dd>{n(value)}</dd></div>
      ))}
    </dl>
  );
}

function Bars({ points, label }: { points: Array<{ date: string; value: number }>; label: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  if (total === 0) return <p className={styles.empty}>لا توجد بيانات في هذه الفترة.</p>;
  return (
    <div className={styles.bars} role="img" aria-label={`${label}: الإجمالي ${total}`}>
      {points.map((point) => (
        <span key={point.date} className={styles.bar} title={`${shortDay(point.date)}: ${n(point.value)}`}>
          <span style={{ blockSize: `${Math.max(point.value > 0 ? 6 : 0, Math.round((point.value / max) * 100))}%` }} />
        </span>
      ))}
    </div>
  );
}

export function MarketplaceAdminDashboardView({ data, duplicates, links }: {
  data: MarketplaceAdminDashboard;
  duplicates: number | null;
  links: Array<{ href: string; label: string }>;
}) {
  const { accounts, catalog, orders, revenue, funnel, storage, problems } = data;
  const attention = attentionItems(data, duplicates);
  const funnelSteps = [
    { label: 'زيارات', value: funnel.visitors, hint: 'زائر فريد لكل يوم على الموقع كله' },
    { label: 'فتح صفحة السوق', value: funnel.marketplace_page_views, hint: 'مشاهدات /marketplace' },
    { label: 'فتح صفحة منتج', value: funnel.product_page_views, hint: 'مشاهدات صفحات المنتجات' },
    { label: 'أضاف للسلة', value: funnel.carts_started, hint: 'سلال جديدة بها منتج واحد على الأقل' },
    { label: 'بدأ إتمام الطلب', value: funnel.checkout_attempts, hint: 'ضغط «تأكيد الطلب»' },
    { label: 'طلب مكتمل', value: funnel.orders_placed, hint: 'طلبات أُنشئت فعلًا' },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((step) => step.value));
  const drops = funnelSteps.slice(1).map((step, index) => ({
    from: funnelSteps[index]!, to: step,
    lost: Math.max(0, funnelSteps[index]!.value - step.value),
  })).filter((drop) => drop.from.value > 0);
  const worstDrop = drops.length > 0
    ? drops.reduce((worst, drop) => (drop.lost / drop.from.value > worst.lost / worst.from.value ? drop : worst))
    : null;
  const failures = Object.entries(funnel.checkout_failures).sort((left, right) => right[1] - left[1]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>إدارة المنصة</p>
          <h1 className={styles.title}>لوحة متابعة السوق</h1>
          <p className={styles.subtitle}>آخر {n(data.days)} يومًا · حُدّثت {dayTime(data.generated_at)}</p>
        </div>
        <nav className={styles.period} aria-label="الفترة">
          {[7, 30, 90].map((days) => (
            <Link key={days} href={`/admin/marketplace/dashboard?days=${days}`} data-active={days === data.days ? 'true' : undefined}>
              {n(days)} يومًا
            </Link>
          ))}
        </nav>
      </header>

      <nav className={styles.links} aria-label="أقسام إدارة السوق">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>

      <section className={styles.section} aria-labelledby="attention-title">
        <h2 id="attention-title">يحتاج انتباهك</h2>
        {attention.length === 0 ? (
          <p className={styles.allClear}>لا يوجد شيء معلّق الآن.</p>
        ) : (
          <ul className={styles.attention}>
            {attention.map((item) => (
              <li key={item.label} data-tone={item.tone}>
                <Link href={item.href}><strong>{n(item.count)}</strong><span>{item.label}</span></Link>
              </li>
            ))}
          </ul>
        )}
        {problems.release_ready === false ? (
          <p className={styles.warning} role="status">
            فحص جاهزية التشغيل غير مكتمل: المهام المجدولة (الإشعارات ومعالجة الصور) لن تعمل حتى تُضاف أسرار Vault في Supabase.
          </p>
        ) : null}
      </section>

      <section className={styles.kpis} aria-label="المؤشرات الرئيسية">
        <div className={styles.kpi}><span>طلبات الفترة</span><strong>{n(orders.period_total)}</strong><small>{n(orders.period_delivered)} تم تسليمها</small></div>
        <div className={styles.kpi}><span>نسبة قبول المتاجر</span><strong>{percent(orders.period_accepted, orders.period_total)}</strong><small>{n(orders.period_accepted)} طلبًا مقبولًا</small></div>
        <div className={styles.kpi}><span>قيمة الطلبات المقبولة</span><strong>{egp(orders.period_gmv_piastres)}</strong><small>تُدفع للتاجر مباشرة</small></div>
        <div className={styles.kpi}><span>دخل المنصة في الفترة</span><strong>{egp(revenue.fees_period_piastres + revenue.subscriptions_period_piastres)}</strong><small>رسوم {egp(revenue.fees_period_piastres)} · اشتراكات {egp(revenue.subscriptions_period_piastres)}</small></div>
        <div className={styles.kpi}><span>أرصدة المحافظ</span><strong>{egp(revenue.wallet_balances_piastres)}</strong><small>شُحن في الفترة {egp(revenue.topups_period_piastres)}</small></div>
        <div className={styles.kpi}><span>حسابات جديدة</span><strong>{n(accounts.profiles_new + accounts.customers_new)}</strong><small>{n(accounts.customers_new)} عميل سوق</small></div>
      </section>

      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="orders-daily-title">
          <h2 id="orders-daily-title">الطلبات يومًا بيوم</h2>
          <Bars label="الطلبات اليومية" points={orders.daily.map((day) => ({ date: day.date, value: day.orders }))} />
          <CountList values={orders.by_status} labels={marketplaceStatusLabels as Record<MarketplaceOrderStatus | string, string>} />
        </section>
        <section className={styles.card} aria-labelledby="visitors-daily-title">
          <h2 id="visitors-daily-title">الزيارات يومًا بيوم</h2>
          <Bars label="الزيارات اليومية" points={funnel.daily_visitors.map((day) => ({ date: day.date, value: day.visitors }))} />
          {funnel.top_routes.length > 0 ? (
            <ol className={styles.routes}>
              {funnel.top_routes.map((route) => (
                <li key={route.route}><bdi dir="ltr">{route.route}</bdi><span>{n(route.views)}</span></li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>

      <section className={styles.card} aria-labelledby="funnel-title">
        <h2 id="funnel-title">رحلة العميل: أين يتوقف الناس؟</h2>
        <ol className={styles.funnel}>
          {funnelSteps.map((step, index) => (
            <li key={step.label}>
              <div className={styles.funnelHead}>
                <strong>{step.label}</strong>
                <span>{n(step.value)}{index > 0 ? ` · ${percent(step.value, funnelSteps[index - 1]!.value)} من الخطوة السابقة` : ''}</span>
              </div>
              <span className={styles.funnelBar}><span style={{ inlineSize: `${Math.round((step.value / funnelMax) * 100)}%` }} /></span>
              <small>{step.hint}</small>
            </li>
          ))}
        </ol>
        {worstDrop && worstDrop.lost > 0 ? (
          <p className={styles.insight}>
            أكبر تسرّب بين «{worstDrop.from.label}» و«{worstDrop.to.label}»: {n(worstDrop.lost)} ({percent(worstDrop.lost, worstDrop.from.value)}) لم يكملوا.
          </p>
        ) : null}
        <div className={styles.inline}>
          <span>سلال مفتوحة بها منتجات ولم تُطلب: <strong>{n(funnel.carts_open_with_items)}</strong></span>
          {failures.length > 0 ? (
            <span>أسباب فشل إتمام الطلب: {failures.map(([code, total]) => <span key={code} className={styles.code}><bdi dir="ltr">{code}</bdi> ×{n(total)}</span>)}</span>
          ) : null}
        </div>
      </section>

      <section className={styles.card} id="stores" aria-labelledby="stores-title">
        <h2 id="stores-title">المتاجر</h2>
        {data.stores.length === 0 ? <p className={styles.empty}>لا توجد متاجر بعد.</p> : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>المتجر</th><th>الحالة</th><th>منتجات منشورة</th><th>طلبات الفترة</th><th>بانتظار القبول</th><th>الرصيد</th><th>مجاني متبقٍ</th><th>التخزين</th><th>جاهزية</th></tr></thead>
              <tbody>
                {data.stores.map((store) => (
                  <tr key={store.id}>
                    <td><strong>{store.name}</strong><small>{store.merchant_name}</small></td>
                    <td>{storeStatusLabels[store.status] ?? store.status}</td>
                    <td>{n(store.active_products)}</td>
                    <td>{n(store.period_orders)}</td>
                    <td data-attention={store.awaiting_orders > 0 ? 'true' : undefined}>{n(store.awaiting_orders)}</td>
                    <td>{egp(store.balance_piastres)}</td>
                    <td>{n(store.free_orders_remaining)}</td>
                    <td>{bytes(store.storage_bytes)}</td>
                    <td>{store.has_contact ? 'رقم التواصل مضاف' : <span className={styles.missing}>بدون رقم تواصل</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="accounts-title">
          <h2 id="accounts-title">الحسابات</h2>
          <dl className={styles.countList}>
            <div><dt>كل الحسابات</dt><dd>{n(accounts.profiles)}</dd></div>
            <div><dt>عملاء السوق</dt><dd>{n(accounts.customers)}</dd></div>
            <div><dt>تجار نشطون</dt><dd>{n(accounts.merchants)}</dd></div>
            <div><dt>كباتن</dt><dd>{n(accounts.drivers)}</dd></div>
          </dl>
          <h3>الأنشطة حسب الحالة</h3>
          <CountList
            values={accounts.workspaces_by_status}
            labels={Object.fromEntries(Object.keys(accounts.workspaces_by_status).map((key) => {
              const [kind = '', status = ''] = key.split(':');
              return [key, `${activityLabels[kind] ?? kind} — ${workspaceStatusLabels[status] ?? status}`];
            }))}
          />
        </section>
        <section className={styles.card} aria-labelledby="catalog-title">
          <h2 id="catalog-title">الكتالوج</h2>
          <h3>المتاجر</h3>
          <CountList values={catalog.stores_by_status} labels={storeStatusLabels} />
          <h3>المنتجات</h3>
          <CountList values={catalog.products_by_status} labels={productStatusLabels} />
          <dl className={styles.countList}>
            <div><dt>أصناف نفد مخزونها</dt><dd>{n(catalog.out_of_stock_variants)}</dd></div>
            <div><dt>مناطق توصيل مفعّلة</dt><dd>{n(catalog.delivery_zones_active)}</dd></div>
          </dl>
        </section>
        <section className={styles.card} aria-labelledby="money-title">
          <h2 id="money-title">الرسوم والمحافظ</h2>
          <dl className={styles.countList}>
            <div><dt>إجمالي الرسوم المحصّلة</dt><dd>{egp(revenue.fees_total_piastres)}</dd></div>
            <div><dt>طلبات مجانية مستخدمة</dt><dd>{n(revenue.free_orders_used)}</dd></div>
            <div><dt>اشتراكات فعّالة</dt><dd>{n(revenue.active_subscriptions)}</dd></div>
            <div><dt>شحن بانتظار المراجعة</dt><dd>{egp(revenue.pending_topups_piastres)}</dd></div>
          </dl>
        </section>
        <section className={styles.card} aria-labelledby="storage-title">
          <h2 id="storage-title">التخزين</h2>
          {storage.buckets.length === 0 ? <p className={styles.empty}>لا توجد ملفات مرفوعة.</p> : (
            <dl className={styles.countList}>
              {storage.buckets.map((bucket) => (
                <div key={bucket.bucket}><dt>{bucketLabels[bucket.bucket] ?? bucket.bucket}<small>{n(bucket.objects)} ملف</small></dt><dd>{bytes(bucket.bytes)}</dd></div>
              ))}
            </dl>
          )}
          <p className={styles.meta}>وسائط المتاجر المُدارة: {n(storage.managed_media_files)} ملف · {bytes(storage.managed_media_bytes)}</p>
        </section>
      </div>

      <section className={styles.card} id="problems" aria-labelledby="problems-title">
        <h2 id="problems-title">مشاكل ظهرت للمستخدمين</h2>
        {problems.client_errors.length === 0 ? <p className={styles.allClear}>لا توجد أخطاء مسجلة آخر ٧ أيام.</p> : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>الصفحة</th><th>نوع الخطأ</th><th>المتصفح</th><th>عدد المرات</th><th>آخر ظهور</th></tr></thead>
              <tbody>
                {problems.client_errors.map((error, index) => (
                  <tr key={`${error.route}:${error.error_kind}:${index}`}>
                    <td><bdi dir="ltr">{error.route}</bdi></td>
                    <td><bdi dir="ltr">{error.error_kind}</bdi><small>{error.event_type}</small></td>
                    <td>{error.browser_family}</td>
                    <td>{n(error.occurrences)}</td>
                    <td>{dayTime(error.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.meta}>
          إشعارات فشلت نهائيًا: {n(problems.push_dead_letters)} · أحداث لم تُعالج: {n(problems.outbox_dead_letters)}
        </p>
      </section>
    </div>
  );
}
