import type { ReactElement, ReactNode } from 'react';
import {
  MessageSquareOff,
  MessageCircle,
  SearchX,
  ShieldAlert,
  PauseCircle,
} from 'lucide-react';
import styles from './chat-presentational.module.css';

export type ChatEmptyStateKind =
  | 'inboxEmpty'
  | 'conversationEmpty'
  | 'searchEmpty'
  | 'blocked'
  | 'paused';

export type ChatEmptyStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
};

export type ChatEmptyStateProps = {
  state: ChatEmptyStateKind;
  title?: string;
  description?: string;
  action?: ChatEmptyStateAction;
  icon?: ReactNode;
  className?: string;
};

const DEFAULT_CONTENT: Record<
  ChatEmptyStateKind,
  { title: string; description: string; defaultIcon: typeof MessageCircle }
> = {
  inboxEmpty: {
    title: 'لا توجد محادثات حتى الآن',
    description: 'ستظهر هنا المحادثات الجديدة الخاصة بك مع المتاجر وخدمة العملاء والطلبات.',
    defaultIcon: MessageSquareOff,
  },
  conversationEmpty: {
    title: 'ابدأ المحادثة الآن',
    description: 'اكتب استفسارك أو طلبك وسيقوم الطرف الآخر بالرد عليك في أسرع وقت.',
    defaultIcon: MessageCircle,
  },
  searchEmpty: {
    title: 'لم نجد نتائج مطابقة',
    description: 'جرّب البحث بكلمات أخرى أو تحقق من كتابة الكلمات بشكل صحيح.',
    defaultIcon: SearchX,
  },
  blocked: {
    title: 'المحادثة غير متاحة',
    description: 'تم إيقاف إرسال واستقبال الرسائل في هذه المحادثة.',
    defaultIcon: ShieldAlert,
  },
  paused: {
    title: 'المحادثة متوقفة مؤقتًا',
    description: 'هذه المحادثة معلّقة مؤقتًا من قِبل إدارة المنصة.',
    defaultIcon: PauseCircle,
  },
};

/**
 * Pure presentational empty state component for chat inboxes and threads.
 */
export function ChatEmptyState({
  state,
  title,
  description,
  action,
  icon,
  className,
}: ChatEmptyStateProps): ReactElement {
  const content = DEFAULT_CONTENT[state] || DEFAULT_CONTENT.inboxEmpty;
  const displayTitle = title || content.title;
  const displayDescription = description || content.description;
  const IconComponent = content.defaultIcon;

  return (
    <div
      role="region"
      aria-label={displayTitle}
      className={`${styles.emptyStateContainer} ${className || ''}`.trim()}
      dir="rtl"
    >
      <div className={styles.emptyStateIconWrapper} aria-hidden="true">
        {icon || <IconComponent size={28} />}
      </div>

      <h3 className={styles.emptyStateTitle}>{displayTitle}</h3>
      <p className={styles.emptyStateDescription}>{displayDescription}</p>

      {action ? (
        action.href ? (
          <a
            href={action.href}
            className={styles.emptyStateAction}
            onClick={action.onClick}
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className={styles.emptyStateAction}
          >
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
