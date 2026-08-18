import Link from 'next/link';
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { Spinner } from '@heroui/react/spinner';
import { Surface } from '@heroui/react/surface';
import styles from './merchant-marketplace.module.css';

export function MerchantStatePanel({
  kind,
  title,
  description,
  action,
}: {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  const Icon = kind === 'error' ? AlertCircle : Inbox;
  return (
    <Surface.Root className={styles.statePanel} role={kind === 'error' ? 'alert' : 'status'}>
      <div className={styles.stateContent}>
        <span className={styles.stateIcon} aria-hidden="true">
          {kind === 'loading' ? (
            <Spinner.Root size="sm" aria-label="جارٍ التحميل" />
          ) : (
            <Icon size={21} />
          )}
        </span>
        <h1 className={styles.sectionTitle}>{title}</h1>
        <p className={styles.subtitle}>{description}</p>
        {action ? (
          <Link href={action.href} className={styles.primaryLink}>
            {kind === 'loading' ? <LoaderCircle size={16} aria-hidden="true" /> : null}
            {action.label}
          </Link>
        ) : null}
      </div>
    </Surface.Root>
  );
}
