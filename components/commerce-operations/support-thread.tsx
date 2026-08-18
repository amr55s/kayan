import Link from 'next/link';
import { closeMarketplaceSupportThreadAction, replyMarketplaceSupportThreadAction } from '@/lib/commerce/operations-actions';
import type { MarketplaceSupportThread } from '@/lib/commerce/operations';
import styles from './commerce-operations.module.css';

export function SupportThreadView({ thread, returnTo, viewingHistory = false }: { thread: MarketplaceSupportThread; returnTo: string; viewingHistory?: boolean }) {
  const next = thread.next_cursor;
  const olderHref = next
    ? `${returnTo}?before=${encodeURIComponent(next.created_at)}&message=${encodeURIComponent(next.id)}`
    : null;
  return <main className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}><bdi dir="ltr">{thread.public_code}</bdi></p><h1 className={styles.title}>{thread.subject}</h1><p className={styles.subtitle}>{thread.status}</p></div></header><section className={styles.list}>{thread.messages.map((message) => <article className={styles.cardContent} key={message.id}><strong>{message.author_role === 'customer' ? 'العميل' : message.author_role === 'merchant' ? 'التاجر' : 'الدعم'}</strong><p>{message.body}</p><time className={styles.meta}>{new Date(message.created_at).toLocaleString('ar-EG')}</time></article>)}</section>{olderHref || viewingHistory ? <nav aria-label="صفحات رسائل الدعم" className={styles.actions}>{olderHref ? <Link className={`${styles.button} ${styles.secondary}`} href={olderHref}>رسائل أقدم</Link> : null}{viewingHistory ? <Link className={styles.button} href={returnTo}>العودة لأحدث الرسائل</Link> : null}</nav> : null}{thread.status !== 'closed' ? <div className={styles.actions}><form className={styles.form} action={replyMarketplaceSupportThreadAction}><input type="hidden" name="threadId" value={thread.id} /><input type="hidden" name="returnTo" value={returnTo} /><label className={styles.label}>الرد<textarea className={styles.field} name="body" required maxLength={5000} rows={4} /></label><button className={styles.button}>إرسال الرد</button></form><form action={closeMarketplaceSupportThreadAction}><input type="hidden" name="threadId" value={thread.id} /><input type="hidden" name="returnTo" value={returnTo} /><button className={`${styles.button} ${styles.secondary}`}>إغلاق المحادثة</button></form></div> : null}</main>;
}
