import styles from './page-skeleton.module.css';

/** Placeholder shapes shown for the instant a server-rendered page is on its way. */
export function DashboardSkeleton({ label, embedded = false }: { label: string; embedded?: boolean }) {
  return (
    <div className={embedded ? styles.embedded : styles.page} role="status" aria-label={label} aria-busy="true">
      <span className={`${styles.block} ${styles.title}`} />
      <span className={`${styles.block} ${styles.line}`} />
      <div className={styles.tiles}>
        {Array.from({ length: 6 }, (_, index) => <span key={index} className={`${styles.block} ${styles.tile}`} />)}
      </div>
      <div className={styles.panels}>
        <span className={`${styles.block} ${styles.panel}`} />
        <span className={`${styles.block} ${styles.panel}`} />
      </div>
      <span className={`${styles.block} ${styles.table}`} />
    </div>
  );
}

export function ListSkeleton({ label, rows = 4, embedded = false }: { label: string; rows?: number; embedded?: boolean }) {
  return (
    <div className={embedded ? styles.embedded : styles.page} role="status" aria-label={label} aria-busy="true">
      <span className={`${styles.block} ${styles.title}`} />
      <span className={`${styles.block} ${styles.line}`} />
      <div className={styles.rows}>
        {Array.from({ length: rows }, (_, index) => <span key={index} className={`${styles.block} ${styles.row}`} />)}
      </div>
    </div>
  );
}

export function DetailSkeleton({ label, embedded = false }: { label: string; embedded?: boolean }) {
  return (
    <div className={embedded ? styles.embedded : styles.page} role="status" aria-label={label} aria-busy="true">
      <span className={`${styles.block} ${styles.line}`} />
      <span className={`${styles.block} ${styles.title}`} />
      <span className={`${styles.block} ${styles.strip}`} />
      <span className={`${styles.block} ${styles.panel}`} />
      <span className={`${styles.block} ${styles.row}`} />
      <span className={`${styles.block} ${styles.row}`} />
    </div>
  );
}
