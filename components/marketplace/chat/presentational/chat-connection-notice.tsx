import type { ReactElement } from 'react';
import { Button } from '@heroui/react';
import { WifiOff, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import styles from './chat-presentational.module.css';

export type ChatConnectionState = 'connecting' | 'online' | 'offline' | 'recovering' | 'error';

export type ChatConnectionNoticeProps = {
  state: ChatConnectionState;
  message?: string;
  onRetry?: () => void;
  className?: string;
};

const DEFAULT_MESSAGES: Record<Exclude<ChatConnectionState, 'online'>, string> = {
  connecting: 'جارٍ الاتصال بالمحادثة…',
  recovering: 'جارٍ استعادة الاتصال بالمحادثة ومزامنة الرسائل…',
  offline: 'أنت غير متصل بالإنترنت. يرجى التحقق من الشبكة.',
  error: 'تعذر الاتصال بخدمة المحادثة.',
};

/**
 * Pure presentational banner indicating connection state.
 * Returns null when connection is stable and online.
 */
export function ChatConnectionNotice({
  state,
  message,
  onRetry,
  className,
}: ChatConnectionNoticeProps): ReactElement | null {
  if (state === 'online') {
    return null;
  }

  const displayText = message || DEFAULT_MESSAGES[state] || DEFAULT_MESSAGES.error;
  const isError = state === 'error' || state === 'offline';
  const isPending = state === 'connecting' || state === 'recovering';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-state={state}
      className={`${styles.connectionNotice} ${className || ''}`.trim()}
      dir="rtl"
    >
      <div className={styles.noticeContent}>
        {isPending ? (
          <Loader2 className={`${styles.noticeIcon} ${styles.spinnerIcon}`} aria-hidden="true" />
        ) : state === 'offline' ? (
          <WifiOff className={styles.noticeIcon} aria-hidden="true" />
        ) : (
          <AlertCircle className={styles.noticeIcon} aria-hidden="true" />
        )}
        <span className={styles.noticeText}>{displayText}</span>
      </div>

      {onRetry && isError ? (
        <Button
          type="button"
          variant="ghost"
          onPress={onRetry}
          className={styles.retryButton}
          aria-label="إعادة محاولة الاتصال بالمحادثة"
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>إعادة المحاولة</span>
        </Button>
      ) : null}
    </div>
  );
}
