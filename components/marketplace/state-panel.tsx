import { CircleAlert, PackageOpen } from 'lucide-react';
import Link from 'next/link';
import styles from './marketplace.module.css';

type MarketplaceStatePanelProps = {
  kind?: 'empty' | 'error';
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function MarketplaceStatePanel({
  kind = 'empty',
  title,
  description,
  actionHref,
  actionLabel,
}: MarketplaceStatePanelProps) {
  const Icon = kind === 'error' ? CircleAlert : PackageOpen;

  return (
    <section
      className={styles.stateCard}
      role={kind === 'error' ? 'alert' : undefined}
      aria-live={kind === 'error' ? 'assertive' : undefined}
    >
      <div className={styles.stateContent}>
        <span className={styles.stateIcon} aria-hidden="true">
          <Icon size={24} strokeWidth={1.8} />
        </span>
        <h1 className={styles.stateTitle}>{title}</h1>
        <p className={styles.stateDescription}>{description}</p>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className={styles.primaryButton}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function MarketplaceCatalogSkeleton({ cards = 10 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="جارٍ تحميل المنتجات" aria-busy="true">
      <div className={styles.sectionHeader}>
        <div style={{ width: 'min(100%, 32rem)' }}>
          <span className={styles.skeletonLine} />
          <span
            className={`${styles.skeletonLine} ${styles.skeletonLineShort}`}
            style={{ marginTop: '0.75rem' }}
          />
        </div>
      </div>
      <div className={styles.skeletonGrid}>
        {Array.from({ length: Math.max(1, cards) }, (_, index) => (
          <div key={index} className={styles.skeletonCard}>
            <span className={styles.skeletonImage} />
            <span className={styles.skeletonLine} />
            <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
