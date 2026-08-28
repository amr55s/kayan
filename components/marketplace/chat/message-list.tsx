'use client';

import { Button } from '@heroui/react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatReactionInput } from '@/lib/commerce/chat/contracts';
import type { ChatMessageDeliveryStatus } from '@/lib/commerce/chat/presentation';
import type { ChatOptimisticMessage } from '@/lib/commerce/chat/reconcile';
import { ChatEmptyState } from './presentational/chat-empty-state';
import { MessageCard } from './message-card';
import styles from './chat.module.css';

const LATEST_EDGE_PX = 64;

export function shouldFollowNewest(input: { wasAtLatest: boolean; prepending: boolean }): boolean {
  return input.wasAtLatest && !input.prepending;
}

export function initialViewportFollowsNewest(firstUnreadMessageId: string | null): boolean {
  return firstUnreadMessageId === null;
}

export type MessageListProps = {
  messages: readonly ChatOptimisticMessage[];
  currentUserId: string;
  firstUnreadMessageId?: string | null;
  canLoadOlder: boolean;
  isLoadingOlder: boolean;
  deliveryStatusByMessageId?: Readonly<Record<string, Exclude<ChatMessageDeliveryStatus, 'sending' | 'failed'> | undefined>>;
  onLoadOlder: () => Promise<void>;
  onRetry: (clientMessageId: string) => void;
  onReply: (message: ChatOptimisticMessage) => void;
  onReact: (input: ChatReactionInput) => void;
};

type PrependMeasurement = { scrollHeight: number; scrollTop: number };

export function MessageList({
  messages,
  currentUserId,
  firstUnreadMessageId = null,
  canLoadOlder,
  isLoadingOlder,
  deliveryStatusByMessageId = {},
  onLoadOlder,
  onRetry,
  onReply,
  onReact,
}: MessageListProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const initialPositionedRef = useRef(false);
  const wasAtLatestRef = useRef(true);
  const previousLastKeyRef = useRef<string | null>(null);
  const prependMeasurementRef = useRef<PrependMeasurement | null>(null);
  const [hasUnseenNewest, setHasUnseenNewest] = useState(false);
  const lastKey = messages.at(-1)?.id ?? null;
  const firstKey = messages.at(0)?.id ?? null;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;

    const prepend = prependMeasurementRef.current;
    if (prepend) {
      viewport.scrollTop = prepend.scrollTop + (viewport.scrollHeight - prepend.scrollHeight);
      prependMeasurementRef.current = null;
      previousLastKeyRef.current = lastKey;
      return;
    }

    if (!initialPositionedRef.current) {
      initialPositionedRef.current = true;
      const unread = firstUnreadMessageId
        ? list.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(firstUnreadMessageId)}"]`)
        : null;
      if (unread) unread.scrollIntoView({ block: 'center' });
      else viewport.scrollTop = viewport.scrollHeight;
      previousLastKeyRef.current = lastKey;
      wasAtLatestRef.current = initialViewportFollowsNewest(unread ? firstUnreadMessageId : null);
      return;
    }

    if (lastKey !== previousLastKeyRef.current) {
      if (shouldFollowNewest({ wasAtLatest: wasAtLatestRef.current, prepending: false })) {
        list.lastElementChild?.scrollIntoView({ block: 'end' });
        setHasUnseenNewest(false);
      } else {
        setHasUnseenNewest(true);
      }
      previousLastKeyRef.current = lastKey;
    }
  }, [firstKey, firstUnreadMessageId, lastKey]);

  const updateLatestEdge = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    wasAtLatestRef.current = distance <= LATEST_EDGE_PX;
    if (wasAtLatestRef.current) setHasUnseenNewest(false);
  };

  const loadOlder = async () => {
    const viewport = viewportRef.current;
    if (!viewport || !canLoadOlder || isLoadingOlder) return;
    prependMeasurementRef.current = { scrollHeight: viewport.scrollHeight, scrollTop: viewport.scrollTop };
    await onLoadOlder();
  };

  const jumpToNewest = () => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' });
    wasAtLatestRef.current = true;
    setHasUnseenNewest(false);
  };

  return (
    <section className={styles.history} aria-label="سجل المحادثة">
      {canLoadOlder ? (
        <Button
          type="button"
          variant="secondary"
          isPending={isLoadingOlder}
          isDisabled={isLoadingOlder}
          onPress={() => void loadOlder()}
          className={styles.loadOlderButton}
        >
          {isLoadingOlder ? 'جارٍ تحميل الرسائل الأقدم…' : 'تحميل رسائل أقدم'}
        </Button>
      ) : null}

      <div ref={viewportRef} className={styles.messageViewport} onScroll={updateLatestEdge}>
        {messages.length === 0 ? (
          <ChatEmptyState state="conversationEmpty" className={styles.conversationEmpty} />
        ) : (
          <ol aria-label="رسائل المحادثة" className={styles.messages} ref={listRef}>
            {messages.map((message) => (
              <MessageCard
                key={message.clientMessageId ?? message.id}
                message={message}
                currentUserId={currentUserId}
                deliveryStatus={deliveryStatusByMessageId[message.id]}
                onRetry={onRetry}
                onReply={onReply}
                onReact={onReact}
              />
            ))}
          </ol>
        )}
      </div>

      {hasUnseenNewest ? (
        <Button type="button" variant="secondary" onPress={jumpToNewest} className={styles.newMessagesButton}>
          رسائل جديدة — الانتقال إلى الأحدث
        </Button>
      ) : null}
    </section>
  );
}
