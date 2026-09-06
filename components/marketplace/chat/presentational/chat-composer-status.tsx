import type { ReactElement } from 'react';
import { Button } from '@heroui/react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import styles from './chat-presentational.module.css';

export type ChatComposerStatusKind = 'idle' | 'sending' | 'failed' | 'retrying';

export type ChatComposerStatusProps = {
  status: ChatComposerStatusKind;
  errorMessage?: string;
  onRetry?: () => void;
  className?: string;
};

/**
 * Pure presentational status strip rendered above or below the message composer.
 * Returns null when idle.
 */
export function ChatComposerStatus({
  status,
  errorMessage,
  onRetry,
  className,
}: ChatComposerStatusProps): ReactElement | null {
  if (status === 'idle') {
    return null;
  }

  const isFailed = status === 'failed';
  const defaultError = 'تعذر إرسال الرسالة. يرجى إعادة المحاولة.';
  const defaultSending = 'جارٍ إرسال الرسالة…';
  const defaultRetrying = 'جارٍ إعادة إرسال الرسالة…';

  return (
    <div
      role={isFailed ? 'alert' : 'status'}
      aria-live={isFailed ? 'assertive' : 'polite'}
      data-status={status}
      className={`${styles.composerStatus} ${className || ''}`.trim()}
      dir="rtl"
    >
      <div className={styles.noticeContent}>
        {isFailed ? (
          <AlertCircle className={styles.noticeIcon} aria-hidden="true" />
        ) : (
          <Loader2 className={`${styles.noticeIcon} ${styles.spinnerIcon}`} aria-hidden="true" />
        )}
        <span className={styles.noticeText}>
          {isFailed
            ? errorMessage || defaultError
            : status === 'retrying'
              ? defaultRetrying
              : defaultSending}
        </span>
      </div>

      {isFailed && onRetry ? (
        <Button
          type="button"
          variant="ghost"
          onPress={onRetry}
          className={styles.retryButton}
          aria-label="إعادة إرسال الرسالة الفاشلة"
        >
          <RotateCcw size={14} aria-hidden="true" />
          <span>إعادة المحاولة</span>
        </Button>
      ) : null}
    </div>
  );
}
