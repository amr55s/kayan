import { DairtakLink } from '@/components/ui/dairtak-link';
import { EmptyState } from '@heroui/react/empty-state';
import { Skeleton } from '@heroui/react/skeleton';
import { CircleAlert, PackageOpen } from 'lucide-react';
import styles from './marketplace.module.css';

type MarketplaceStatePanelProps = {
  headingLevel?: 1 | 2;
  kind?: 'empty' | 'error';
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function MarketplaceStatePanel({
  headingLevel = 1,
  kind = 'empty',
  title,
  description,
  actionHref,
  actionLabel,
}: MarketplaceStatePanelProps) {
  const Icon = kind === 'error' ? CircleAlert : PackageOpen;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section
      className={styles.stateCard}
      role={kind === 'error' ? 'alert' : undefined}
      aria-live={kind === 'error' ? 'assertive' : undefined}
    >
      <EmptyState className={styles.stateContent}>
        <span className={styles.stateIcon} aria-hidden="true">
          <Icon size={24} strokeWidth={1.8} />
        </span>
        <Heading className={styles.stateTitle}>{title}</Heading>
        <p className={styles.stateDescription}>{description}</p>
        {actionHref && actionLabel ? (
          <DairtakLink href={actionHref} className={styles.primaryButton} variant="primary">
              {actionLabel}
            </DairtakLink>
        ) : null}
      </EmptyState>
    </section>
  );
}

export function MarketplaceCatalogSkeleton({ cards = 10 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="جارٍ تحميل المنتجات" aria-busy="true">
      <div className={styles.sectionHeader}>
        <div style={{ width: 'min(100%, 32rem)' }}>
          <Skeleton className={`${styles.skeletonLine} h-4 w-full rounded`} />
          <Skeleton
            className={`${styles.skeletonLine} ${styles.skeletonLineShort} h-4 w-2/3 rounded`}
            style={{ marginTop: '0.75rem' }}
          />
        </div>
      </div>
      <div className={styles.skeletonGrid}>
        {Array.from({ length: Math.max(1, cards) }, (_, index) => (
          <div key={index} className={styles.skeletonCard}>
            <Skeleton className={`${styles.skeletonImage} aspect-square w-full rounded-md`} />
            <Skeleton className={`${styles.skeletonLine} h-3.5 w-3/4 rounded`} />
            <Skeleton className={`${styles.skeletonLine} ${styles.skeletonLineShort} h-3.5 w-1/2 rounded`} />
          </div>
        ))}
      </div>
    </div>
  );
}
