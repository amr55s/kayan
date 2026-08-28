'use client';

import { Button } from '@heroui/react';
import type { ChatReactionInput } from '@/lib/commerce/chat/contracts';
import { CHAT_STATUS_COPY } from '@/lib/commerce/chat/copy';
import {
  formatChatTimestamp,
  getChatMessageA11yLabel,
  getChatMessageDirection,
  type ChatMessageDeliveryStatus,
} from '@/lib/commerce/chat/presentation';
import type { ChatOptimisticMessage } from '@/lib/commerce/chat/reconcile';
import styles from './chat.module.css';

const ROLE_LABELS: Record<ChatOptimisticMessage['senderRole'], string> = {
  customer: 'العميل',
  merchant: 'المتجر',
  driver: 'مندوب التوصيل',
  admin: 'الدعم',
  system: 'النظام',
};

const CARD_LABELS = {
  product: 'بطاقة منتج',
  store: 'بطاقة متجر',
  order: 'بطاقة طلب',
  location: 'موقع تمت مشاركته بموافقة المرسل',
} as const;

const REACTION_EMOJIS: readonly ChatReactionInput['emoji'][] = ['👍', '❤️', '✅', '🙏', '😄'];

export function chatMessagePlainSummary(message: ChatOptimisticMessage): string {
  if (message.deleted) return CHAT_STATUS_COPY.deleted;
  if (message.kind === 'image') return message.attachment?.alt?.trim().slice(0, 160) || 'صورة مرفقة';
  if (message.card) return message.card.label.trim().slice(0, 160) || CARD_LABELS[message.card.type];
  if (message.body) return message.body.trim().slice(0, 160);
  return message.kind === 'system' ? 'إشعار من النظام' : 'رسالة';
}

function MessageBody({ message }: { message: ChatOptimisticMessage }) {
  if (message.deleted) return <p className={styles.tombstone}>{CHAT_STATUS_COPY.deleted}</p>;
  if (message.kind === 'image') {
    return (
      <div className={styles.attachmentPlaceholder}>
        <span aria-hidden="true">▧</span>
        <span>{message.attachment?.alt?.trim().slice(0, 160) || 'صورة مرفقة'}</span>
        <small>تُعرض المرفقات الخاصة عبر عارض مصرح به فقط.</small>
      </div>
    );
  }
  if (message.card) {
    return (
      <section className={styles.sharedCard} aria-label={CARD_LABELS[message.card.type]}>
        <small>{CARD_LABELS[message.card.type]}</small>
        <strong>{message.card.label.trim().slice(0, 180)}</strong>
      </section>
    );
  }
  return <p className={styles.messageBody}>{message.body?.trim() || (message.kind === 'system' ? 'إشعار من النظام' : 'رسالة')}</p>;
}

export type MessageCardProps = {
  message: ChatOptimisticMessage;
  currentUserId: string;
  deliveryStatus?: Exclude<ChatMessageDeliveryStatus, 'sending' | 'failed'>;
  onRetry?: (clientMessageId: string) => void;
  onReply?: (message: ChatOptimisticMessage) => void;
  onReact?: (input: ChatReactionInput) => void;
};

export function MessageCard({
  message,
  currentUserId,
  deliveryStatus = 'sent',
  onRetry,
  onReply,
  onReact,
}: MessageCardProps) {
  const direction = getChatMessageDirection(message, currentUserId);
  const status: ChatMessageDeliveryStatus = message.status === 'sending' || message.status === 'failed'
    ? message.status
    : deliveryStatus;
  const a11yLabel = getChatMessageA11yLabel({ ...message, status }, 'ar-EG', 'Africa/Cairo');
  const reactions = new Map(message.reactions.map((reaction) => [reaction.emoji, reaction]));

  return (
    <li
      className={styles.messageItem}
      data-direction={direction}
      data-status={status}
      data-message-id={message.id}
      aria-label={a11yLabel}
    >
      <article className={styles.messageBubble}>
        <span className={styles.senderLabel}>{ROLE_LABELS[message.senderRole]}</span>
        {message.replyToId && !message.deleted ? (
          <p className={styles.replyContext}>رد على رسالة سابقة</p>
        ) : null}
        <MessageBody message={message} />
        <footer className={styles.messageMeta}>
          <time dateTime={message.createdAt}>
            {formatChatTimestamp(message.createdAt, 'ar-EG', 'Africa/Cairo')}
          </time>
          {direction === 'outgoing' ? <span>{CHAT_STATUS_COPY[status]}</span> : null}
        </footer>
      </article>

      {!message.deleted && direction !== 'system' ? (
        <div className={styles.messageActions} aria-label="إجراءات الرسالة">
          {REACTION_EMOJIS.map((emoji) => {
            const reaction = reactions.get(emoji);
            return (
              <Button
                key={emoji}
                type="button"
                variant="ghost"
                isIconOnly
                isDisabled={!onReact || message.status !== 'sent'}
                aria-label={`${reaction?.reactedByMe ? 'إزالة' : 'إضافة'} تفاعل ${emoji}`}
                aria-pressed={reaction?.reactedByMe ?? false}
                onPress={() => onReact?.({ messageId: message.id, emoji, active: !(reaction?.reactedByMe ?? false) })}
                className={styles.reactionButton}
              >
                <span aria-hidden="true">{emoji}</span>
                {reaction?.count ? <small>{reaction.count}</small> : null}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            isDisabled={!onReply || message.status !== 'sent'}
            onPress={() => onReply?.(message)}
            className={styles.inlineAction}
          >
            رد
          </Button>
        </div>
      ) : null}

      {message.status === 'failed' && message.clientMessageId ? (
        <Button
          type="button"
          variant="danger"
          isDisabled={!onRetry}
          onPress={() => onRetry?.(message.clientMessageId!)}
          className={styles.retryMessageButton}
          aria-label="إعادة إرسال الرسالة الفاشلة بنفس معرّف المحاولة"
        >
          إعادة إرسال الرسالة
        </Button>
      ) : null}
    </li>
  );
}
