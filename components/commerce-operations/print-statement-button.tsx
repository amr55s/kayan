'use client';

import { Printer } from 'lucide-react';

import styles from './commerce-operations.module.css';

export function PrintStatementButton() {
  return (
    <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" />
      طباعة الكشف
    </button>
  );
}
