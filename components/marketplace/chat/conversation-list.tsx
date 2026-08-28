'use client';

import Link from 'next/link';
import type { ChatConversationSummary, ChatRole } from '@/lib/commerce/chat/contracts';
import { formatChatTimestamp } from '@/lib/commerce/chat/presentation';
import { ChatEmptyState } from './presentational/chat-empty-state';
import styles from './chat.module.css';

const STATUS_LABELS: Record<ChatConversationSummary['status'], string> = {
  open: 'مفتوحة',
  waiting_customer: 'بانتظار العميل',
  waiting_support: 'بانتظار الدعم',
  resolved: 'تم الحل',
  closed: 'مغلقة',
  paused: 'متوقفة مؤقتًا',
};

const ROLE_LABELS: Record<ChatRole, string> = {
  customer: 'عميل',
  merchant: 'متجر',
  driver: 'مندوب توصيل',
  admin: 'الدعم',
  system: 'النظام',
};

export type ChatRiskState = 'review' | 'reported' | 'elevated';

const RISK_LABELS: Record<ChatRiskState, string> = {
  review: 'قيد المراجعة',
  reported: 'تم الإبلاغ',
  elevated: 'مخاطر مرتفعة',
};

export function safeConversationPreview(value: string | null | undefined): string {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return normalized.length > 160 ? `${normalized.slice(0, 160)}…` : normalized;
}

export type ConversationListProps = {
  items: readonly ChatConversationSummary[];
  basePath: '/account/chat' | '/merchant/marketplace/chat' | '/driver/marketplace/chat' | '/admin/marketplace/chat';
  activeConversationId?: string | null;
  viewerRole: Exclude<ChatRole, 'system'>;
  previews?: Readonly<Record<string, string | null | undefined>>;
  riskStates?: Readonly<Record<string, ChatRiskState | undefined>>;
};

export function ConversationList({
  items,
  basePath,
  activeConversationId = null,
  viewerRole,
  previews = {},
  riskStates = {},
}: ConversationListProps) {
  return (
    <nav aria-label="صندوق المحادثات" className={styles.inboxPane}>
      <header className={styles.inboxHeader}>
        <div>
          <p className={styles.eyebrow}>رسائل كيان</p>
          <h1 className={styles.inboxTitle}>المحادثات</h1>
        </div>
        <span className={styles.inboxCount} aria-label={`${items.length} محادثة`}>
          {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <ChatEmptyState state="inboxEmpty" className={styles.inboxEmpty} />
      ) : (
        <ol className={styles.conversationList}>
          {items.map((item) => {
            const identity = item.counterpart?.displayName ?? item.store?.name ?? item.subject;
            const identityRole = item.counterpart?.role ?? (item.store ? 'merchant' : 'admin');
            const preview = safeConversationPreview(previews[item.id]) || safeConversationPreview(item.subject);
            const risk = viewerRole === 'admin' ? riskStates[item.id] : undefined;
            return (
              <li key={item.id}>
                <Link
                  href={`${basePath}/${item.id}`}
                  className={styles.conversationRow}
                  data-active={item.id === activeConversationId || undefined}
                  aria-current={item.id === activeConversationId ? 'page' : undefined}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {identity.trim().slice(0, 1) || 'ك'}
                  </span>
                  <span className={styles.conversationSummary}>
                    <span className={styles.rowHeading}>
                      <strong>{identity}</strong>
                      <time dateTime={item.lastMessageAt}>
                        {formatChatTimestamp(item.lastMessageAt, 'ar-EG', 'Africa/Cairo')}
                      </time>
                    </span>
                    <span className={styles.rowMeta}>
                      {ROLE_LABELS[identityRole]} · {STATUS_LABELS[item.status]}
                      {item.order ? (
                        <> · طلب <bdi dir="ltr">{item.order.publicCode}</bdi></>
                      ) : null}
                    </span>
                    <span className={styles.rowFooter}>
                      <span className={styles.preview}>{preview}</span>
                      {risk ? <span className={styles.riskBadge}>{RISK_LABELS[risk]}</span> : null}
                      {item.unreadCount > 0 ? (
                        <span className={styles.unreadBadge} aria-label={`${item.unreadCount} رسائل غير مقروءة`}>
                          {item.unreadCount > 99 ? '99+' : item.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
