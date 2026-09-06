'use client';

import { Button } from '@heroui/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatReactionInput } from '@/lib/commerce/chat/contracts';
import type { ChatMessageDeliveryStatus } from '@/lib/commerce/chat/presentation';
import type { ChatOptimisticMessage } from '@/lib/commerce/chat/reconcile';
import { ChatEmptyState } from './presentational/chat-empty-state';
import { MessageCard } from './message-card';
import styles from './chat.module.css';

const LATEST_EDGE_PX = 64;
const READ_ACK_GRACE_MS = 80;
const MAX_VISIBLE_READ_ATTEMPTS = 2;

export function shouldFollowNewest(input: { wasAtLatest: boolean; prepending: boolean }): boolean {
  return input.wasAtLatest && !input.prepending;
}

export function initialViewportFollowsNewest(firstUnreadMessageId: string | null): boolean {
  return firstUnreadMessageId === null;
}

export function readCursorCoversMessage(
  messages: readonly ChatOptimisticMessage[],
  lastReadMessageId: string | null,
  targetMessageId: string,
): boolean {
  if (!lastReadMessageId) return false;
  const readIndex = messages.findIndex((message) => message.id === lastReadMessageId);
  const targetIndex = messages.findIndex((message) => message.id === targetMessageId);
  return readIndex >= 0 && targetIndex >= 0 && readIndex >= targetIndex;
}

type VisibleMessageEntry = {
  messageId: string;
  isIntersecting: boolean;
  intersectionRatio: number;
};

export function selectVisibleIncomingReadTarget(input: {
  messages: readonly ChatOptimisticMessage[];
  currentUserId: string;
  lastReadMessageId: string | null;
  entries: readonly VisibleMessageEntry[];
  documentVisibility: DocumentVisibilityState;
}): string | null {
  if (input.documentVisibility !== 'visible') return null;
  const readIndex = input.lastReadMessageId
    ? input.messages.findIndex((message) => message.id === input.lastReadMessageId)
    : -1;
  const visibleIds = new Set(input.entries
    .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
    .map((entry) => entry.messageId));
  let targetId: string | null = null;
  input.messages.forEach((message, index) => {
    if (
      index > readIndex
      && visibleIds.has(message.id)
      && message.status === 'sent'
      && message.senderRole !== 'system'
      && message.senderId !== input.currentUserId
    ) targetId = message.id;
  });
  return targetId;
}

export function classifyOlderPageChange(input: {
  beforeFirstKey: string | null;
  beforeLastKey: string | null;
  afterFirstKey: string | null;
  afterLastKey: string | null;
  afterMessageKeys?: readonly string[];
}): 'prepend' | 'unchanged' | 'nonprepend' {
  if (input.afterFirstKey === input.beforeFirstKey && input.afterLastKey === input.beforeLastKey) return 'unchanged';
  if (
    input.beforeFirstKey !== null
    && input.afterFirstKey !== input.beforeFirstKey
    && (
      input.afterLastKey === input.beforeLastKey
      || input.afterMessageKeys?.includes(input.beforeFirstKey)
    )
  ) return 'prepend';
  return 'nonprepend';
}

export type MessageListProps = {
  messages: readonly ChatOptimisticMessage[];
  currentUserId: string;
  firstUnreadMessageId?: string | null;
  lastReadMessageId: string | null;
  isReadOnline: boolean;
  canLoadOlder: boolean;
  isLoadingOlder: boolean;
  deliveryStatusByMessageId?: Readonly<Record<string, Exclude<ChatMessageDeliveryStatus, 'sending' | 'failed'> | undefined>>;
  onLoadOlder: () => Promise<void>;
  onVisibleIncomingMessage: (messageId: string) => Promise<void> | void;
  onRetry?: (clientMessageId: string) => void;
  onReply?: (message: ChatOptimisticMessage) => void;
  onReact?: (input: ChatReactionInput) => void;
};

type PrependMeasurement = {
  anchorMessageId: string | null;
  anchorTop: number | null;
  beforeFirstKey: string | null;
  beforeLastKey: string | null;
};

export function MessageList({
  messages,
  currentUserId,
  firstUnreadMessageId = null,
  lastReadMessageId,
  isReadOnline,
  canLoadOlder,
  isLoadingOlder,
  deliveryStatusByMessageId = {},
  onLoadOlder,
  onVisibleIncomingMessage,
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
  const previousLoadingOlderRef = useRef(isLoadingOlder);
  const [olderLoadSettlement, setOlderLoadSettlement] = useState(0);
  const previousOlderLoadSettlementRef = useRef(olderLoadSettlement);
  const readOnlineRef = useRef(isReadOnline);
  const wasReadOnlineRef = useRef(isReadOnline);
  const onVisibleIncomingMessageRef = useRef(onVisibleIncomingMessage);
  const latestVisibleMessageIdRef = useRef<string | null>(null);
  const lastRequestedMessageIdRef = useRef<string | null>(null);
  const inFlightMessageIdRef = useRef<string | null>(null);
  const readRequestTargetRef = useRef<string | null>(null);
  const readRequestAttemptsRef = useRef(0);
  const readRequestGenerationRef = useRef(0);
  const [readSettlement, setReadSettlement] = useState(0);
  const [hasUnseenNewest, setHasUnseenNewest] = useState(false);
  const lastKey = messages.at(-1)?.id ?? null;
  const firstKey = messages.at(0)?.id ?? null;

  useLayoutEffect(() => {
    readOnlineRef.current = isReadOnline;
    onVisibleIncomingMessageRef.current = onVisibleIncomingMessage;
  }, [isReadOnline, onVisibleIncomingMessage]);

  const resetVisibleReadRequest = useCallback((clearVisibleTarget: boolean): void => {
    readRequestGenerationRef.current += 1;
    readRequestTargetRef.current = null;
    readRequestAttemptsRef.current = 0;
    lastRequestedMessageIdRef.current = null;
    inFlightMessageIdRef.current = null;
    if (clearVisibleTarget) latestVisibleMessageIdRef.current = null;
  }, []);

  const requestVisibleMessage = useCallback(function requestVisibleMessage(messageId: string): void {
    latestVisibleMessageIdRef.current = messageId;
    if (!readOnlineRef.current || document.visibilityState !== 'visible') return;
    if (readRequestTargetRef.current !== messageId) {
      readRequestGenerationRef.current += 1;
      readRequestTargetRef.current = messageId;
      readRequestAttemptsRef.current = 0;
      lastRequestedMessageIdRef.current = null;
      inFlightMessageIdRef.current = null;
    }
    if (inFlightMessageIdRef.current === messageId) return;
    if (lastRequestedMessageIdRef.current === messageId) return;
    if (readRequestAttemptsRef.current >= MAX_VISIBLE_READ_ATTEMPTS) return;
    readRequestAttemptsRef.current += 1;
    lastRequestedMessageIdRef.current = messageId;
    inFlightMessageIdRef.current = messageId;
    const generation = readRequestGenerationRef.current;
    void Promise.resolve(onVisibleIncomingMessageRef.current(messageId))
      .catch(() => undefined)
      .finally(() => {
        if (readRequestGenerationRef.current !== generation) return;
        if (inFlightMessageIdRef.current === messageId) inFlightMessageIdRef.current = null;
        setReadSettlement((current) => current + 1);
      });
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;

    const loadFinished = previousLoadingOlderRef.current && !isLoadingOlder;
    previousLoadingOlderRef.current = isLoadingOlder;
    const loadSettled = previousOlderLoadSettlementRef.current !== olderLoadSettlement;
    previousOlderLoadSettlementRef.current = olderLoadSettlement;
    const prepend = prependMeasurementRef.current;
    if (prepend && (loadFinished || loadSettled)) {
      const change = classifyOlderPageChange({
        beforeFirstKey: prepend.beforeFirstKey,
        beforeLastKey: prepend.beforeLastKey,
        afterFirstKey: firstKey,
        afterLastKey: lastKey,
        afterMessageKeys: messages.map((message) => message.id),
      });
      const historyPrepended = change === 'prepend';
      if (change === 'prepend' && prepend.anchorMessageId && prepend.anchorTop !== null) {
        const retainedAnchor = list.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(prepend.anchorMessageId)}"]`,
        );
        if (retainedAnchor) {
          viewport.scrollTop += retainedAnchor.getBoundingClientRect().top - prepend.anchorTop;
        }
      }
      prependMeasurementRef.current = null;
      if (previousLastKeyRef.current !== null && lastKey && lastKey !== previousLastKeyRef.current) {
        if (shouldFollowNewest({ wasAtLatest: wasAtLatestRef.current, prepending: historyPrepended })) {
          list.lastElementChild?.scrollIntoView({ block: 'end' });
          setHasUnseenNewest(false);
        } else {
          setHasUnseenNewest(true);
        }
      }
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
  }, [firstKey, firstUnreadMessageId, isLoadingOlder, lastKey, messages, olderLoadSettlement]);

  useEffect(() => {
    const wasOnline = wasReadOnlineRef.current;
    wasReadOnlineRef.current = isReadOnline;
    if (!isReadOnline) {
      resetVisibleReadRequest(false);
      return;
    }
    if (!wasOnline) {
      const latestVisibleMessageId = latestVisibleMessageIdRef.current;
      if (latestVisibleMessageId && document.visibilityState === 'visible') {
        requestVisibleMessage(latestVisibleMessageId);
      }
    }
  }, [isReadOnline, requestVisibleMessage, resetVisibleReadRequest]);

  useEffect(() => {
    const targetMessageId = readRequestTargetRef.current;
    if (targetMessageId && readCursorCoversMessage(messages, lastReadMessageId, targetMessageId)) {
      resetVisibleReadRequest(true);
    }
  }, [lastReadMessageId, messages, resetVisibleReadRequest]);

  useEffect(() => {
    const targetMessageId = readRequestTargetRef.current;
    if (
      !targetMessageId
      || inFlightMessageIdRef.current
      || !isReadOnline
      || document.visibilityState !== 'visible'
      || readCursorCoversMessage(messages, lastReadMessageId, targetMessageId)
      || readRequestAttemptsRef.current >= MAX_VISIBLE_READ_ATTEMPTS
    ) return;
    const generation = readRequestGenerationRef.current;
    const retryTimer = window.setTimeout(() => {
      if (
        readRequestGenerationRef.current !== generation
        || readRequestTargetRef.current !== targetMessageId
        || latestVisibleMessageIdRef.current !== targetMessageId
        || !readOnlineRef.current
        || document.visibilityState !== 'visible'
        || readCursorCoversMessage(messages, lastReadMessageId, targetMessageId)
      ) return;
      lastRequestedMessageIdRef.current = null;
      requestVisibleMessage(targetMessageId);
    }, READ_ACK_GRACE_MS);
    return () => window.clearTimeout(retryTimer);
  }, [isReadOnline, lastReadMessageId, messages, readSettlement, requestVisibleMessage]);

  useEffect(() => () => {
    resetVisibleReadRequest(true);
  }, [resetVisibleReadRequest]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list || typeof IntersectionObserver === 'undefined') return;
    const visibleEntries = new Map<string, VisibleMessageEntry>();
    const evaluate = () => {
      const target = selectVisibleIncomingReadTarget({
        messages,
        currentUserId,
        lastReadMessageId,
        entries: [...visibleEntries.values()],
        documentVisibility: document.visibilityState,
      });
      if (!target) {
        if (latestVisibleMessageIdRef.current) resetVisibleReadRequest(true);
        return;
      }
      requestVisibleMessage(target);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const messageId = (entry.target as HTMLElement).dataset.messageId;
        if (messageId) {
          visibleEntries.set(messageId, {
            messageId,
            isIntersecting: entry.isIntersecting,
            intersectionRatio: entry.intersectionRatio,
          });
        }
      });
      evaluate();
    }, { root: viewport, threshold: [0.6] });
    list.querySelectorAll<HTMLElement>('[data-message-id]').forEach((element) => observer.observe(element));
    document.addEventListener('visibilitychange', evaluate);
    return () => {
      document.removeEventListener('visibilitychange', evaluate);
      observer.disconnect();
    };
  }, [currentUserId, lastReadMessageId, messages, requestVisibleMessage, resetVisibleReadRequest]);

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
    const anchorMessageId = firstKey;
    const anchor = anchorMessageId
      ? listRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchorMessageId)}"]`)
      : null;
    prependMeasurementRef.current = {
      anchorMessageId,
      anchorTop: anchor?.getBoundingClientRect().top ?? null,
      beforeFirstKey: firstKey,
      beforeLastKey: lastKey,
    };
    try {
      await onLoadOlder();
    } catch {
      // The persistent error UI belongs to the hook; this prevents an unhandled rejection.
    } finally {
      setOlderLoadSettlement((current) => current + 1);
    }
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
