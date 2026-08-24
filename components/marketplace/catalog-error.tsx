'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { useEffect } from 'react';
import { reportClientError } from '@/lib/observability/client-errors';
import styles from './marketplace.module.css';

export function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientError(error, 'react_boundary');
  }, [error]);

  return (
    <Card.Root className={styles.stateCard} role="alert" aria-live="assertive">
      <Card.Content className={styles.stateContent}>
        <h1 className={styles.stateTitle}>تعذر تحميل المتجر</h1>
        <p className={styles.stateDescription}>
          سلتك محفوظة. حاول التحميل مرة أخرى، وإذا استمرت المشكلة فعد للمتجر لاحقًا.
        </p>
        <Button.Root type="button" className={styles.primaryButton} onPress={reset}>
          إعادة المحاولة
        </Button.Root>
      </Card.Content>
    </Card.Root>
  );
}
