import Link from 'next/link';
import { Check } from 'lucide-react';
import { formatMarketplaceCount, formatMarketplaceMoney } from '@/components/marketplace/format';
import type { StoreLaunchChecklist as Checklist } from '@/lib/commerce/wallet';
import styles from './launch-checklist.module.css';

type Step = { done: boolean; title: string; hint: string; href: string; action: string };

/** What a new store still has to do before customers can order, in order. */
export function StoreLaunchChecklist({ storeId, checklist }: { storeId: string; checklist: Checklist }) {
  const settingsHref = `/merchant/marketplace/settings?store=${encodeURIComponent(storeId)}`;
  const published = checklist.store_status === 'published';
  const steps: Step[] = [
    {
      done: checklist.products_total > 0,
      title: 'أضف أول منتج',
      hint: checklist.products_total > 0 && checklist.products_active === 0
        ? 'منتجاتك قيد المراجعة وتظهر للعملاء بعد اعتمادها.'
        : 'صورة واضحة وسعر ومخزون، أو ارفع كل منتجاتك مرة واحدة من ملف Excel.',
      href: '/merchant/marketplace/new',
      action: 'إضافة منتج',
    },
    {
      done: checklist.has_contact,
      title: 'أضف رقم التواصل',
      hint: 'يظهر للعميل بعد أن تقبل طلبه ليتواصل معك مباشرة.',
      href: `${settingsHref}#contact`,
      action: 'إضافة الرقم',
    },
    {
      done: checklist.has_delivery,
      title: 'حدد مناطق التوصيل ورسومها',
      hint: 'العميل لا يستطيع الطلب إلا من منطقة فعّلتها.',
      href: `${settingsHref}#delivery`,
      action: 'ضبط التوصيل',
    },
    {
      done: published,
      title: 'أرسل المتجر للمراجعة',
      hint: checklist.store_status === 'pending_review'
        ? 'المتجر قيد مراجعة الإدارة الآن.'
        : 'بعد اعتماد المتجر تظهر منتجاتك في سوق ديرتك.',
      href: settingsHref,
      action: checklist.store_status === 'pending_review' ? 'عرض الحالة' : 'إرسال للمراجعة',
    },
  ];
  const remaining = steps.filter((step) => !step.done).length;
  const credit = checklist.subscription_active
    ? 'اشتراكك فعّال — طلباتك بدون رسوم'
    : checklist.free_orders_remaining > 0
      ? `متبقٍ ${formatMarketplaceCount(checklist.free_orders_remaining)} من طلباتك المجانية`
      : `رصيد المحفظة ${formatMarketplaceMoney({ amountMinor: checklist.balance_piastres, currency: 'EGP' })}`;
  const outOfCredit = !checklist.subscription_active
    && checklist.free_orders_remaining === 0
    && checklist.balance_piastres < checklist.order_fee_fixed_piastres;

  if (remaining === 0) {
    return (
      <section className={styles.summary} aria-label="حالة المتجر">
        <Link href="/merchant/marketplace/orders" className={styles.summaryItem} data-attention={checklist.awaiting_orders > 0 ? 'true' : undefined}>
          <strong>{formatMarketplaceCount(checklist.awaiting_orders)}</strong>
          <span>طلبات بانتظار قبولك</span>
        </Link>
        <Link href="/merchant/marketplace/wallet" className={styles.summaryItem} data-attention={outOfCredit ? 'true' : undefined}>
          <strong>{outOfCredit ? 'اشحن المحفظة' : 'المحفظة'}</strong>
          <span>{outOfCredit ? 'الرصيد لا يكفي لقبول طلب جديد' : credit}</span>
        </Link>
        <div className={styles.summaryItem}>
          <strong>{formatMarketplaceCount(checklist.products_active)}</strong>
          <span>منتجات منشورة</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.checklist} aria-labelledby="launch-checklist-title">
      <div className={styles.head}>
        <div>
          <h2 id="launch-checklist-title">جهّز متجرك لاستقبال الطلبات</h2>
          <p>باقي {formatMarketplaceCount(remaining)} من {formatMarketplaceCount(steps.length)} خطوات. {credit}.</p>
        </div>
        <span className={styles.progress} role="img" aria-label={`اكتمل ${steps.length - remaining} من ${steps.length}`}>
          <span style={{ inlineSize: `${Math.round(((steps.length - remaining) / steps.length) * 100)}%` }} />
        </span>
      </div>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.title} className={styles.step} data-done={step.done ? 'true' : undefined}>
            <span className={styles.mark} aria-hidden="true">{step.done ? <Check size={14} /> : null}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.hint}</p>
            </div>
            {step.done
              ? <span className={styles.doneLabel}>تم</span>
              : <Link href={step.href} className={styles.action}>{step.action}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
