import Link from 'next/link';
import { Download } from 'lucide-react';

import { formatMarketplaceMoney } from '@/components/marketplace/format';
import type { MarketplaceCommissionStatementDetail, MarketplaceReconciliationDetail } from '@/lib/commerce/operations';
import { transitionCommissionStatementAction } from '@/lib/commerce/operations-actions';
import styles from './commerce-operations.module.css';
import { PrintStatementButton } from './print-statement-button';

const money = (amount: string | number) => formatMarketplaceMoney({ amountMinor: Number(amount), currency: 'EGP' });

export function ReconciliationDetailView({ batch }: { batch: MarketplaceReconciliationDetail }) {
  return <main className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>تسوية نقدية</p><h1 className={styles.title}>{batch.status}</h1><p className={styles.subtitle}>المتوقع {money(batch.expected_total_piastres)} · المرسل {money(batch.submitted_total_piastres)}</p></div></header><section className={styles.list}>{batch.items.map((item) => <article className={styles.cardContent} key={item.collection_id}><div className={styles.row}><span>طلب <bdi dir="ltr">{item.order_code}</bdi></span><strong>{money(item.submitted_amount_piastres)}</strong></div><p className={styles.meta}>{item.collection_status}</p></article>)}</section>{batch.notes ? <p>{batch.notes}</p> : null}</main>;
}

export function CommissionDetailView({ statement, admin = false }: {
  statement: MarketplaceCommissionStatementDetail;
  admin?: boolean;
}) {
  const transitions = statement.status === 'draft'
    ? ['issued', 'void']
    : statement.status === 'issued'
      ? ['paid', 'disputed', 'void']
      : statement.status === 'disputed' ? ['issued', 'void'] : [];
  const labels: Record<string, string> = {
    issued: 'إصدار الكشف', paid: 'تسجيل السداد', disputed: 'فتح نزاع', void: 'إلغاء الكشف',
  };
  const returnTo = `/admin/marketplace/commissions/${statement.id}`;
  const exportBase = `/api/marketplace/commissions/${encodeURIComponent(statement.id)}/export`;

  return <main className={`${styles.page} ${styles.statementPage}`}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>كشف عمولة</p>
        <h1 className={styles.title}>{statement.period_start} — {statement.period_end}</h1>
        <p className={styles.subtitle}>الحالة {statement.status} · الإجمالي {money(statement.gross_piastres)} · المستحق {money(statement.total_due_piastres)}</p>
      </div>
      <div className={`${styles.actions} ${styles.noPrint}`}>
        <Link className={styles.button} href={`${exportBase}?format=xlsx`}><Download size={16} aria-hidden="true" />تنزيل XLSX</Link>
        <Link className={`${styles.button} ${styles.secondary}`} href={`${exportBase}?format=csv`}><Download size={16} aria-hidden="true" />تنزيل CSV</Link>
        <PrintStatementButton />
      </div>
    </header>

    <section className={styles.statementSummary} aria-label="ملخص كشف العمولة">
      <dl className={styles.summaryGrid}>
        <div><dt>إجمالي المبيعات</dt><dd>{money(statement.gross_piastres)}</dd></div>
        <div><dt>نسبة العمولة</dt><dd>{(Number(statement.commission_rate) * 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}%</dd></div>
        <div><dt>العمولة</dt><dd>{money(statement.commission_piastres)}</dd></div>
        <div><dt>التعديل اليدوي</dt><dd>{money(statement.manual_adjustment_piastres)}</dd></div>
        <div><dt>إجمالي المستحق</dt><dd>{money(statement.total_due_piastres)}</dd></div>
      </dl>
    </section>

    {admin && transitions.length > 0 ? <section className={`${styles.panel} ${styles.noPrint}`}><h2>إدارة دورة الكشف</h2><div className={styles.actions}>{transitions.map((next) => <form className={styles.form} action={transitionCommissionStatementAction} key={next}><input type="hidden" name="statementId" value={statement.id} /><input type="hidden" name="next" value={next} /><input type="hidden" name="idempotencyKey" value={`commission-${crypto.randomUUID()}`} /><input type="hidden" name="returnTo" value={returnTo} />{statement.status === 'draft' ? <label className={styles.label}>تعديل يدوي بالقرش<input className={styles.field} name="manualAdjustmentMinor" inputMode="numeric" pattern="-?[0-9]+" defaultValue={String(statement.manual_adjustment_piastres)} /></label> : null}<label className={styles.label}>ملاحظات {['disputed', 'void'].includes(next) ? '(مطلوبة)' : '(اختيارية)'}<textarea className={styles.field} name="notes" required={['disputed', 'void'].includes(next)} minLength={3} maxLength={2000} /></label><button className={`${styles.button} ${next === 'void' ? styles.danger : ''}`}>{labels[next]}</button></form>)}</div></section> : null}

    <section className={styles.statementEntries} aria-labelledby="statement-entries-title">
      <h2 id="statement-entries-title">تفاصيل القيود</h2>
      {statement.entries.length ? <div className={styles.tableScroll}><table className={styles.statementTable}><thead><tr><th>التاريخ</th><th>نوع القيد</th><th>الطلب</th><th>إجمالي المبيعات</th><th>العمولة</th></tr></thead><tbody>{statement.entries.map((entry) => <tr key={entry.id}><td><time dateTime={entry.recognized_at}>{entry.recognized_at.slice(0, 16).replace('T', ' ')}</time></td><td>{entry.entry_type}</td><td><bdi dir="ltr">{entry.order_id ?? '—'}</bdi></td><td>{money(entry.gross_piastres)}</td><td>{money(entry.commission_piastres)}</td></tr>)}</tbody></table></div> : <p className={styles.meta}>لا توجد قيود مرتبطة بهذا الكشف.</p>}
    </section>

    {statement.notes ? <section className={styles.statementNotes}><h2>ملاحظات</h2><p>{statement.notes}</p></section> : null}
  </main>;
}
