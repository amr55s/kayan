'use client';

import { Button, Drawer, Dropdown, Label } from '@heroui/react';
import Link from 'next/link';
import { cloneElement, useCallback, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type {
  ChatActionState,
  ChatConversationPage,
  ChatConversationSummary,
  ChatMessage,
  ChatMessagePage,
  ChatRole,
  ChatSearchInput,
} from '@/lib/commerce/chat/contracts';
import { getChatErrorMessage } from '@/lib/commerce/chat/copy';
import type { ChatMessageDeliveryStatus } from '@/lib/commerce/chat/presentation';
import type { ChatOptimisticMessage } from '@/lib/commerce/chat/reconcile';
import {
  useMarketplaceChat,
  type ChatConnectionState,
} from '@/hooks/useMarketplaceChat';
import {
  ConversationList,
  type ChatRiskState,
} from './conversation-list';
import { chatMessagePlainSummary } from './message-card';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import { ChatConnectionNotice } from './presentational/chat-connection-notice';
import { ChatEmptyState } from './presentational/chat-empty-state';
import styles from './chat.module.css';

export type MarketplaceChatBasePath =
  | '/account/chat'
  | '/merchant/marketplace/chat'
  | '/driver/marketplace/chat'
  | '/admin/marketplace/chat';

type SuccessfulActionState = Extract<ChatActionState, { status: 'sent' }>;
type FailedActionState = Extract<ChatActionState, { status: 'error' }>;

export type MarketplaceChatBlockResult = FailedActionState | {
  status: 'sent';
  blocked: boolean;
  orderSupportAvailable: boolean;
  safeCopy: string;
};

export type MarketplaceChatMenuActions = {
  searchMessages(input: ChatSearchInput): Promise<Pick<ChatMessagePage, 'messages' | 'nextCursor'>>;
  setMuted(input: { conversationId: string; muted: boolean }): Promise<SuccessfulActionState | FailedActionState>;
  reportConversation(input: {
    conversationId: string;
    reason: 'abuse' | 'spam' | 'unsafe_contact' | 'other';
  }): Promise<SuccessfulActionState | FailedActionState>;
  setBlocked(input: {
    conversationId: string;
    counterpartyUserId: string;
    blocked: boolean;
  }): Promise<MarketplaceChatBlockResult>;
};

export type MarketplaceChatShellProps = {
  initialInbox: ChatConversationPage;
  initialConversation: ChatMessagePage | null;
  currentUserId: string;
  role: Exclude<ChatRole, 'system'>;
  basePath: MarketplaceChatBasePath;
  inboxPreviews?: Readonly<Record<string, string | null | undefined>>;
  riskStates?: Readonly<Record<string, ChatRiskState | undefined>>;
  deliveryStatusByMessageId?: Readonly<Record<string, Exclude<ChatMessageDeliveryStatus, 'sending' | 'failed'> | undefined>>;
  counterpartyUserId?: string | null;
  isMuted?: boolean;
  isBlocked?: boolean;
  menuActions?: MarketplaceChatMenuActions;
  /** Monitoring staff can inspect conversations but never mutate participant chat state. */
  readOnly?: boolean;
  /** Set by the server only after checking an active delivery assignment. */
  canShareLocation?: boolean;
};

type SendAvailabilityInput = {
  status: ChatConversationSummary['status'];
  blocked: boolean;
  connectionState: ChatConnectionState;
};

export function normalizeChatSearchQuery(value: string): string | null {
  const query = value.trim().replace(/\s+/g, ' ');
  return query.length >= 1 && query.length <= 200 ? query : null;
}

export function canSendMarketplaceChatMessage(input: SendAvailabilityInput): boolean {
  const writable = input.status === 'open'
    || input.status === 'waiting_customer'
    || input.status === 'waiting_support';
  return writable
    && !input.blocked
    && input.connectionState !== 'offline'
    && input.connectionState !== 'error';
}

export function deriveMessageDeliveryStatuses(
  _messages: readonly ChatOptimisticMessage[],
  _currentUserId: string,
  _lastReadMessageId: string | null,
  explicit: MarketplaceChatShellProps['deliveryStatusByMessageId'] = {},
): Record<string, Exclude<ChatMessageDeliveryStatus, 'sending' | 'failed'>> {
  const result: Record<string, Exclude<ChatMessageDeliveryStatus, 'sending' | 'failed'>> = {};
  for (const [messageId, status] of Object.entries(explicit ?? {})) {
    if (status) result[messageId] = status;
  }
  return result;
}

export async function runMarketplaceChatMenuAction<T extends ChatActionState | MarketplaceChatBlockResult>(
  action: () => Promise<T>,
): Promise<T | FailedActionState> {
  try {
    return await action();
  } catch {
    return { status: 'error', code: 'service_unavailable' };
  }
}

function safeActionCopy(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 500);
}

function connectionMessage(state: ChatConnectionState): string | undefined {
  if (state === 'offline') return 'أنت غير متصل الآن. يعود الإرسال بعد استعادة الشبكة.';
  if (state === 'error') return 'تعذر مزامنة المحادثة بأمان. حاول مجددًا بعد قليل.';
  return undefined;
}

function PoliteConnectionNotice({ state }: { state: ChatConnectionState }) {
  const notice = ChatConnectionNotice({ state, message: connectionMessage(state) });
  return notice ? cloneElement(
    notice as ReactElement<{ role?: string; 'aria-live'?: 'polite' }>,
    { role: 'status', 'aria-live': 'polite' },
  ) : null;
}

function disabledComposerReason(
  conversation: ChatConversationSummary,
  blocked: boolean,
  connectionState: ChatConnectionState,
  readOnly: boolean,
): string | null {
  if (readOnly) return 'لوحة المراقبة للقراءة فقط ولا تسمح بإرسال الرسائل.';
  if (blocked) return 'تم حظر الرسائل المباشرة مع هذا المشارك.';
  if (conversation.status === 'paused') return 'المحادثة متوقفة مؤقتًا بقرار من إدارة المنصة.';
  if (conversation.status === 'closed' || conversation.status === 'resolved') return 'هذه المحادثة مغلقة ولا تقبل رسائل جديدة.';
  if (connectionState === 'offline') return 'الإرسال متوقف حتى عودة الاتصال بالإنترنت.';
  if (connectionState === 'error') return 'الإرسال متوقف حتى تكتمل مزامنة المحادثة.';
  return null;
}

function firstUnreadMessageId(messages: readonly ChatOptimisticMessage[], lastReadMessageId: string | null, currentUserId: string) {
  const readIndex = lastReadMessageId ? messages.findIndex((message) => message.id === lastReadMessageId) : -1;
  return messages.slice(readIndex + 1).find((message) => (
    message.status === 'sent' && message.senderId !== currentUserId && message.senderRole !== 'system'
  ))?.id ?? null;
}

function SearchResults({ messages }: { messages: readonly ChatMessage[] }) {
  if (messages.length === 0) return <ChatEmptyState state="searchEmpty" className={styles.searchEmpty} />;
  return (
    <ol className={styles.searchResults} aria-label="نتائج البحث في المحادثة">
      {messages.map((message) => (
        <li key={message.id}>
          <p>{chatMessagePlainSummary({ ...message, status: 'sent', failureCode: null })}</p>
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ar-EG')}</time>
        </li>
      ))}
    </ol>
  );
}

function ActiveConversation({
  page,
  currentUserId,
  role,
  basePath,
  deliveryStatusByMessageId = {},
  counterpartyUserId = null,
  initialMuted = false,
  initialBlocked = false,
  menuActions,
  readOnly = false,
  canShareLocation = false,
}: {
  page: ChatMessagePage;
  currentUserId: string;
  role: Exclude<ChatRole, 'system'>;
  basePath: MarketplaceChatBasePath;
  deliveryStatusByMessageId?: MarketplaceChatShellProps['deliveryStatusByMessageId'];
  counterpartyUserId?: string | null;
  initialMuted?: boolean;
  initialBlocked?: boolean;
  menuActions?: MarketplaceChatMenuActions;
  readOnly?: boolean;
  canShareLocation?: boolean;
}) {
  const chat = useMarketplaceChat({
    conversationId: page.conversation.id,
    initialPage: page,
    currentUserId,
    currentUserPresence: {
      role,
      displayName: role === 'customer' ? 'العميل' : role === 'merchant' ? 'المتجر' : role === 'driver' ? 'مندوب التوصيل' : 'الدعم',
    },
  });
  const [replyTo, setReplyTo] = useState<ChatOptimisticMessage | null>(null);
  const [muted, setMuted] = useState(initialMuted);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [menuPending, setMenuPending] = useState<'mute' | 'report' | 'block' | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const conversation = page.conversation;
  const { connectionState, lastReadMessageId, markRead, messages } = chat;
  const handleVisibleIncomingMessage = useCallback(
    (messageId: string) => markRead(messageId),
    [markRead],
  );
  const canSend = !readOnly && canSendMarketplaceChatMessage({
    status: conversation.status,
    blocked,
    connectionState,
  });
  const failedMessage = [...messages].reverse().find((message) => message.status === 'failed') ?? null;
  const unreadId = useMemo(
    () => firstUnreadMessageId(messages, lastReadMessageId, currentUserId),
    [lastReadMessageId, messages, currentUserId],
  );
  const resolvedDeliveryStatuses = useMemo(
    () => deriveMessageDeliveryStatuses(
      messages,
      currentUserId,
      lastReadMessageId,
      deliveryStatusByMessageId,
    ),
    [lastReadMessageId, messages, currentUserId, deliveryStatusByMessageId],
  );

  const runMenuAction = async (action: 'mute' | 'report' | 'block') => {
    if (!menuActions || menuPending) return;
    setMenuPending(action);
    setActionError('');
    setActionMessage('');
    try {
      if (action === 'mute') {
        const result = await runMarketplaceChatMenuAction(() => menuActions.setMuted({
          conversationId: conversation.id,
          muted: !muted,
        }));
        if (result.status === 'error') setActionError(getChatErrorMessage(result.code));
        else {
          setMuted(!muted);
          setActionMessage(!muted ? 'تم كتم إشعارات هذه المحادثة.' : 'تم تشغيل إشعارات هذه المحادثة.');
        }
      } else if (action === 'report') {
        const result = await runMarketplaceChatMenuAction(() => menuActions.reportConversation({
          conversationId: conversation.id,
          reason: 'abuse',
        }));
        if (result.status === 'error') setActionError(getChatErrorMessage(result.code));
        else setActionMessage('تم إرسال البلاغ للمراجعة دون مشاركة محتوى المحادثة خارج المنصة.');
      } else if (counterpartyUserId) {
        const result = await runMarketplaceChatMenuAction(() => menuActions.setBlocked({
          conversationId: conversation.id,
          counterpartyUserId,
          blocked: !blocked,
        }));
        if (result.status === 'error') setActionError(getChatErrorMessage(result.code));
        else {
          setBlocked(result.blocked);
          const copy = safeActionCopy(result.safeCopy);
          setActionMessage(copy || (result.orderSupportAvailable
            ? 'تم حظر الرسائل المباشرة، وتظل رسائل دعم الطلب متاحة داخل المنصة.'
            : 'تم تحديث الحظر.'));
        }
      }
    } finally {
      setMenuPending(null);
    }
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = normalizeChatSearchQuery(searchQuery);
    if (!query || !menuActions) {
      setActionError(query ? 'البحث غير متاح حاليًا.' : 'اكتب من حرف إلى 200 حرف للبحث.');
      return;
    }
    setSearchPending(true);
    setActionError('');
    try {
      const result = await menuActions.searchMessages({
        conversationId: conversation.id,
        query,
        limit: 30,
        cursor: null,
      });
      setSearchResults(result.messages.slice(0, 30));
    } catch {
      setActionError(getChatErrorMessage('service_unavailable'));
      setSearchResults([]);
    } finally {
      setSearchPending(false);
    }
  };

  const menuDisabledKeys = [
    ...(!menuActions ? ['search', 'mute', 'report', 'block'] : []),
    ...(!counterpartyUserId ? ['block'] : []),
  ];
  const displayIdentity = conversation.counterpart?.displayName ?? conversation.store?.name ?? conversation.subject;

  return (
    <div className={styles.activeConversation}>
      <header className={styles.conversationHeader}>
        <Link href={basePath} className={styles.backLink} aria-label="العودة إلى قائمة المحادثات">
          <span aria-hidden="true">→</span>
          <span>المحادثات</span>
        </Link>
        <div className={styles.conversationIdentity}>
          <strong>{displayIdentity}</strong>
          <span>
            {conversation.order ? <>طلب <bdi dir="ltr">{conversation.order.publicCode}</bdi> · </> : null}
            <bdi dir="ltr">{conversation.publicCode}</bdi>
          </span>
        </div>

        <Dropdown>
          <Button
            type="button"
            variant="secondary"
            isPending={menuPending !== null}
            isDisabled={menuPending !== null}
            aria-label="إجراءات المحادثة"
            className={styles.menuButton}
          >
            إجراءات
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label="إجراءات المحادثة"
              disabledKeys={menuDisabledKeys}
              onAction={(key) => {
                if (key === 'search') setDrawerOpen(true);
                if (key === 'mute' || key === 'report' || key === 'block') void runMenuAction(key);
              }}
            >
              <Dropdown.Item id="search" textValue="بحث داخل المحادثة"><Label>بحث داخل المحادثة</Label></Dropdown.Item>
              <Dropdown.Item id="mute" textValue={muted ? 'تشغيل الإشعارات' : 'كتم الإشعارات'}><Label>{muted ? 'تشغيل الإشعارات' : 'كتم الإشعارات'}</Label></Dropdown.Item>
              <Dropdown.Item id="report" textValue="إبلاغ عن إساءة"><Label>إبلاغ عن إساءة</Label></Dropdown.Item>
              <Dropdown.Item id="block" textValue={blocked ? 'إلغاء الحظر' : 'حظر المشارك'} variant="danger"><Label>{blocked ? 'إلغاء الحظر' : 'حظر المشارك'}</Label></Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </header>

      {readOnly ? <p role="status" className={styles.actionAnnouncement}>لوحة المراقبة للقراءة فقط؛ لا يمكن إرسال رسائل أو تعديل المشاركين.</p> : null}

      <PoliteConnectionNotice state={connectionState} />
      <div className={styles.actionAnnouncement}>
        {actionError || actionMessage}
      </div>

      {blocked && messages.length === 0 ? (
        <ChatEmptyState state="blocked" className={styles.conversationEmpty} />
      ) : conversation.status === 'paused' && messages.length === 0 ? (
        <ChatEmptyState state="paused" className={styles.conversationEmpty} />
      ) : (conversation.status === 'closed' || conversation.status === 'resolved') && messages.length === 0 ? (
        <ChatEmptyState
          state="blocked"
          title="المحادثة مغلقة"
          description="يمكنك الرجوع إلى الرسائل السابقة، لكن لا يمكن إرسال رسائل جديدة هنا."
          className={styles.conversationEmpty}
        />
      ) : (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          firstUnreadMessageId={unreadId}
          lastReadMessageId={lastReadMessageId}
          isReadOnline={connectionState === 'online'}
          canLoadOlder={chat.canLoadOlder}
          isLoadingOlder={chat.isLoadingOlder}
          deliveryStatusByMessageId={resolvedDeliveryStatuses}
          onLoadOlder={chat.loadOlder}
          onVisibleIncomingMessage={handleVisibleIncomingMessage}
          onRetry={readOnly ? undefined : (clientMessageId) => void chat.retry(clientMessageId)}
          onReply={readOnly ? undefined : setReplyTo}
          onReact={readOnly ? undefined : (input) => void chat.react(input)}
        />
      )}

      {chat.typingUsers.length > 0 ? (
        <p className={styles.typingNotice}>{chat.typingUsers.map((user) => user.displayName).join('، ')} يكتب الآن…</p>
      ) : null}

      <MessageComposer
        conversationId={conversation.id}
        senderRole={role}
        composerRef={chat.composer.ref}
        onComposerInput={chat.composer.onInput}
        onComposerBlur={chat.composer.onBlur}
        disabledReason={canSend ? null : disabledComposerReason(conversation, blocked, connectionState, readOnly)}
        replyTo={replyTo}
        failedMessage={failedMessage}
        onCancelReply={() => setReplyTo(null)}
        onSend={readOnly ? async () => null : chat.send}
        onRetry={readOnly ? async () => undefined : chat.retry}
        allowLocationShare={canShareLocation && conversation.kind === 'order' && conversation.status === 'open' && !readOnly}
      />

      <Drawer.Backdrop isOpen={drawerOpen} onOpenChange={setDrawerOpen} variant="blur">
        <Drawer.Content placement="left" className={styles.drawerContent}>
          <Drawer.Dialog aria-label="البحث داخل المحادثة" className={styles.drawerDialog}>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>البحث داخل المحادثة</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              <form onSubmit={search} className={styles.searchForm}>
                <Label htmlFor="chat-search">عبارة البحث</Label>
                <input
                  id="chat-search"
                  type="search"
                  value={searchQuery}
                  minLength={1}
                  maxLength={200}
                  required
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className={styles.searchInput}
                  autoComplete="off"
                />
                <Button type="submit" isPending={searchPending} isDisabled={searchPending || !menuActions}>
                  بحث آمن
                </Button>
              </form>
              <SearchResults messages={searchResults} />
            </Drawer.Body>
            <Drawer.Footer>
              <Button type="button" variant="secondary" onPress={() => setDrawerOpen(false)}>
                إغلاق
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}

export function MarketplaceChatShell({
  initialInbox,
  initialConversation,
  currentUserId,
  role,
  basePath,
  inboxPreviews = {},
  riskStates = {},
  deliveryStatusByMessageId = {},
  counterpartyUserId = null,
  isMuted = false,
  isBlocked = false,
  menuActions,
  readOnly = role === 'admin',
  canShareLocation = false,
}: MarketplaceChatShellProps) {
  const inboxItems = Array.isArray(initialInbox?.items) ? initialInbox.items : [];
  const activePage = initialConversation?.conversation && Array.isArray(initialConversation.messages)
    ? initialConversation
    : null;
  return (
    <main
      className={styles.shell}
      data-has-conversation={Boolean(activePage)}
      dir="rtl"
    >
      <ConversationList
        items={inboxItems}
        basePath={basePath}
        activeConversationId={activePage?.conversation.id}
        viewerRole={role}
        previews={inboxPreviews}
        riskStates={riskStates}
      />
      <section aria-label="المحادثة" className={styles.conversationPane}>
        {activePage ? (
          <ActiveConversation
            key={`${activePage.conversation.id}:${currentUserId}`}
            page={activePage}
            currentUserId={currentUserId}
            role={role}
            basePath={basePath}
            deliveryStatusByMessageId={deliveryStatusByMessageId}
            counterpartyUserId={counterpartyUserId}
            initialMuted={isMuted}
            initialBlocked={isBlocked}
            menuActions={menuActions}
            readOnly={readOnly}
            canShareLocation={canShareLocation}
          />
        ) : (
          <ChatEmptyState state="conversationEmpty" className={styles.shellEmpty} />
        )}
      </section>
    </main>
  );
}
