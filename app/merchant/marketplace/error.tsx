'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@heroui/react/button';
import styles from '@/components/marketplace/merchant/merchant-marketplace.module.css';

export default function MerchantMarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Merchant marketplace route failed', {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <section className={styles.statePanel} role="alert">
      <div className={styles.stateContent}>
        <span className={styles.stateIcon} aria-hidden="true"><AlertCircle size={21} /></span>
        <h1 className={styles.sectionTitle}>تعذر تحميل إدارة المنتجات</h1>
        <p className={styles.subtitle}>لم تُحفظ أي تعديلات. أعد المحاولة بعد استقرار الاتصال.</p>
        <Button.Root type="button" onPress={reset} className={styles.primaryButton}>
          <RefreshCw size={16} aria-hidden="true" />
          إعادة المحاولة
        </Button.Root>
      </div>
    </section>
  );
}
