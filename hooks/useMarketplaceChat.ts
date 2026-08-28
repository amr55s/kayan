'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEventHandler,
  type RefObject,
} from 'react';
import { z } from 'zod';
import {
  chatMessageSchema,
  reactionSchema,
  sendMessageSchema,
} from '../lib/commerce/chat/input.ts';
import {
  markOptimisticFailed,
  reconcileChatPage,
  shouldCatchUp,
  type ChatOptimisticMessage,
} from '../lib/commerce/chat/reconcile.ts';
import {
  chatConversationKinds,
  chatRoles,
  type ChatCursor,
  type ChatErrorCode,
  type ChatMessage,
  type ChatMessagePage,
  type ChatReactionInput,
  type ChatRole,
  type SendMessageInput,
} from '../lib/commerce/chat/contracts.ts';

export type ChatConnectionState = 'connecting' | 'online' | 'offline' | 'recovering' | 'error';

export type ChatPresenceDisplay = {
  role: Exclude<ChatRole, 'system'>;
  displayName: string;
};

export type ChatTypingUser = ChatPresenceDisplay & {
  /** Ephemeral per-tab identifier. This is never an account/user identifier. */
  presenceId: string;
};

export type MarketplaceChatSendInput = Omit<SendMessageInput, 'conversationId' | 'clientMessageId'> & {
  /** Used only for the local optimistic row and never sent to an RPC or Broadcast. */
  senderRole: Exclude<ChatRole, 'system'>;
};

export type UseMarketplaceChatOptions = {
  conversationId: string;
  initialPage: ChatMessagePage;
  currentUserId: string;
  /** Optional, bounded display state for Presence. No user id is copied into its payload. */
  currentUserPresence?: ChatPresenceDisplay;
  /** Optional injected browser dependencies for lifecycle tests and embedders. */
  controllerDependencies?: MarketplaceChatControllerDependencies;
};

export type MarketplaceChatState = {
  conversationId: string;
  currentUserId: string;
  messages: ChatOptimisticMessage[];
  connectionState: ChatConnectionState;
  connectionError: ChatErrorCode | null;
  typingUsers: ChatTypingUser[];
  nextCursor: ChatCursor | null;
  hasOlder: boolean;
  canLoadOlder: boolean;
  isLoadingOlder: boolean;
  lastReadMessageId: string | null;
};

export type MarketplaceChatComposerContract = {
  ref: RefObject<HTMLTextAreaElement | null>;
  onInput: FormEventHandler<HTMLTextAreaElement>;
  onBlur: () => void;
};

type ChatReadCursorResult = {
  conversationId: string;
  lastReadMessageId: string;
};

type GetPageRequest = {
  conversationId: string;
  limit: number;
  cursor: ChatCursor | null;
  signal: AbortSignal;
};

export type MarketplaceChatTransport = {
  getConversationPage(input: GetPageRequest): Promise<ChatMessagePage>;
  sendMessage(input: SendMessageInput, signal: AbortSignal): Promise<ChatMessage>;
  markConversationRead(
    input: { conversationId: string; messageId: string },
    signal: AbortSignal,
  ): Promise<ChatReadCursorResult>;
  setReaction(input: ChatReactionInput, signal: AbortSignal): Promise<ChatMessage>;
};

type RpcRequest = {
  abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
};

type MarketplaceChatRpcClient = {
  rpc(name: string, args: Record<string, unknown>): RpcRequest;
};

type BroadcastEnvelope = {
  type: 'broadcast';
  event: 'message_changed' | 'read_changed' | 'typing';
  payload: Record<string, unknown>;
};

type RealtimeChannelLike = {
  on(type: 'broadcast' | 'presence', filter: { event: string }, callback: (payload: unknown) => void): RealtimeChannelLike;
  subscribe(callback: (status: string, error?: unknown) => void): RealtimeChannelLike;
  send(envelope: BroadcastEnvelope): PromiseLike<unknown>;
  track(payload: Record<string, unknown>): PromiseLike<unknown>;
  presenceState(): Record<string, unknown[]>;
};

type RealtimeClientLike = MarketplaceChatRpcClient & {
  realtime: { setAuth(token?: string): PromiseLike<unknown> };
  channel(topic: string, options: Record<string, unknown>): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): PromiseLike<unknown>;
};

type BrowserTarget = {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
};

type DocumentTarget = BrowserTarget & { visibilityState?: string };
type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>;
type CatchUpRun = {
  generation: number;
  controller: AbortController;
  promise: Promise<void>;
};

export type MarketplaceChatControllerDependencies = {
  realtimeClient: RealtimeClientLike;
  transport: MarketplaceChatTransport;
  browser?: BrowserTarget;
  document?: DocumentTarget;
  isOnline?: () => boolean;
  randomUUID?: () => string;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => TimeoutHandle;
  clearTimeout?: (handle: TimeoutHandle) => void;
};

export type MarketplaceChatController = {
  start(): Promise<void>;
  stop(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): MarketplaceChatState;
  send(input: MarketplaceChatSendInput): Promise<string | null>;
  retry(clientMessageId: string): Promise<void>;
  loadOlder(): Promise<void>;
  markRead(messageId: string): Promise<void>;
  react(input: ChatReactionInput): Promise<void>;
  notifyTyping(active: boolean): void;
};

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const cursorSchema = z.object({ createdAt: timestampSchema, id: uuidSchema }).strict();
const conversationSummarySchema = z.object({
  id: uuidSchema,
  publicCode: z.string().min(1).max(64),
  kind: z.enum(chatConversationKinds),
  status: z.enum(['open', 'waiting_customer', 'waiting_support', 'resolved', 'closed', 'paused']),
  subject: z.string().min(1).max(160),
  store: z.object({ id: uuidSchema, name: z.string().min(1).max(180) }).strict().nullable(),
  order: z.object({ id: uuidSchema, publicCode: z.string().min(1).max(64) }).strict().nullable(),
  counterpart: z.object({
    displayName: z.string().min(1).max(180),
    role: z.enum(chatRoles),
    avatarUrl: z.url().nullable(),
  }).strict().nullable(),
  lastMessageAt: timestampSchema,
  unreadCount: z.number().int().nonnegative(),
}).strict();
const messagePageSchema: z.ZodType<ChatMessagePage> = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(chatMessageSchema).max(100),
  nextCursor: cursorSchema.nullable(),
  lastReadMessageId: uuidSchema.nullable(),
}).strict();
const readCursorSchema: z.ZodType<ChatReadCursorResult> = z.object({
  conversationId: uuidSchema,
  lastReadMessageId: uuidSchema,
}).strict();
const providerErrorSchema = z.object({ code: z.string().optional(), status: z.number().optional() }).passthrough();
const presenceDisplaySchema = z.object({
  presenceId: uuidSchema,
  role: z.enum(['customer', 'merchant', 'driver', 'admin']),
  displayName: z.string().trim().min(1).max(80),
}).strip();
const stableRpcErrorCodes: Readonly<Record<string, ChatErrorCode>> = {
  '28000': 'authentication_required',
  '22023': 'invalid_input',
  'P0002': 'not_found',
  '55000': 'closed',
  'P0001': 'rate_limited',
};
const safeErrorCodes = new Set<ChatErrorCode>([
  'invalid_input',
  'authentication_required',
  'not_found',
  'closed',
  'rate_limited',
  'service_unavailable',
]);
const TYPING_EXPIRY_MS = 4_000;
const TYPING_THROTTLE_MS = 2_000;
const PAGE_LIMIT = 100;
const MAX_CONFIRMED_MESSAGES = 100;
const useCommittedLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

class MarketplaceChatClientError extends Error {
  readonly code: ChatErrorCode;

  constructor(code: ChatErrorCode) {
    super(code);
    this.code = code;
    this.name = 'MarketplaceChatClientError';
  }
}

function safeErrorCode(error: unknown): ChatErrorCode {
  if (error instanceof MarketplaceChatClientError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === 'string' && safeErrorCodes.has(value as ChatErrorCode)) {
      return value as ChatErrorCode;
    }
  }
  return 'service_unavailable';
}

function mapRpcError(error: unknown): MarketplaceChatClientError {
  const parsed = providerErrorSchema.safeParse(error);
  if (!parsed.success) return new MarketplaceChatClientError('service_unavailable');
  if (parsed.data.status === 401) return new MarketplaceChatClientError('authentication_required');
  return new MarketplaceChatClientError(
    parsed.data.code ? stableRpcErrorCodes[parsed.data.code] ?? 'service_unavailable' : 'service_unavailable',
  );
}

async function resolveRpc<T>(
  request: RpcRequest,
  signal: AbortSignal,
  schema: z.ZodType<T>,
): Promise<T> {
  let result: { data: unknown; error: unknown };
  try {
    result = await request.abortSignal(signal);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new MarketplaceChatClientError('service_unavailable');
  }
  if (result.error) throw mapRpcError(result.error);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new MarketplaceChatClientError('service_unavailable');
  return parsed.data;
}

/**
 * Browser-safe adapter over the four participant-scoped RPCs needed by this
 * hook. Its allowlist is deliberately closed and never accepts sender identity.
 */
export function createMarketplaceChatTransport(
  supabase: MarketplaceChatRpcClient,
): MarketplaceChatTransport {
  return {
    getConversationPage(input) {
      return resolveRpc(
        supabase.rpc('get_my_marketplace_conversation_page', {
          p_thread_id: input.conversationId,
          p_limit: input.limit,
          p_before_created_at: input.cursor?.createdAt ?? null,
          p_before_id: input.cursor?.id ?? null,
        }),
        input.signal,
        messagePageSchema,
      );
    },
    sendMessage(input, signal) {
      const parsed = sendMessageSchema.safeParse(input);
      if (!parsed.success) return Promise.reject(new MarketplaceChatClientError('invalid_input'));
      return resolveRpc(
        supabase.rpc('send_my_marketplace_chat_message', {
          p_thread_id: parsed.data.conversationId,
          p_client_message_id: parsed.data.clientMessageId,
          p_kind: parsed.data.kind,
          p_body: parsed.data.body,
          p_reply_to_id: parsed.data.replyToId,
          p_card_data: parsed.data.card,
        }),
        signal,
        chatMessageSchema,
      );
    },
    markConversationRead(input, signal) {
      const parsed = z.object({ conversationId: uuidSchema, messageId: uuidSchema }).strict().safeParse(input);
      if (!parsed.success) return Promise.reject(new MarketplaceChatClientError('invalid_input'));
      return resolveRpc(
        supabase.rpc('set_my_marketplace_chat_read_cursor', {
          p_thread_id: parsed.data.conversationId,
          p_message_id: parsed.data.messageId,
        }),
        signal,
        readCursorSchema,
      );
    },
    setReaction(input, signal) {
      const parsed = reactionSchema.safeParse(input);
      if (!parsed.success) return Promise.reject(new MarketplaceChatClientError('invalid_input'));
      return resolveRpc(
        supabase.rpc('react_to_my_marketplace_chat_message', {
          p_message_id: parsed.data.messageId,
          p_emoji: parsed.data.emoji,
          p_active: parsed.data.active,
        }),
        signal,
        chatMessageSchema,
      );
    },
  };
}

function latestCursor(messages: ChatOptimisticMessage[]): ChatCursor | null {
  const confirmed = messages.filter((item) => item.status === 'sent');
  const latest = confirmed.at(-1);
  return latest ? { createdAt: latest.createdAt, id: latest.id } : null;
}

function initialState(
  page: ChatMessagePage,
  online: boolean,
  conversationId = page.conversation.id,
  currentUserId = '',
): MarketplaceChatState {
  const messages = reconcileChatPage([], page.messages);
  const confirmedCount = messages.filter((item) => item.status === 'sent').length;
  return {
    conversationId,
    currentUserId,
    messages,
    connectionState: online ? 'connecting' : 'offline',
    connectionError: null,
    typingUsers: [],
    nextCursor: page.nextCursor,
    hasOlder: page.nextCursor !== null,
    canLoadOlder: page.nextCursor !== null && confirmedCount < MAX_CONFIRMED_MESSAGES,
    isLoadingOlder: false,
    lastReadMessageId: page.lastReadMessageId,
  };
}

function extractPayload(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const payload = record.payload;
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : record;
}

function fireAndForget(value: PromiseLike<unknown>): void {
  void Promise.resolve(value).catch(() => undefined);
}

export function createMarketplaceChatController(
  options: UseMarketplaceChatOptions,
  dependencies: MarketplaceChatControllerDependencies,
): MarketplaceChatController {
  const browser = dependencies.browser;
  const documentTarget = dependencies.document;
  const isOnline = dependencies.isOnline ?? (() => true);
  const randomUUID = dependencies.randomUUID ?? (() => globalThis.crypto.randomUUID());
  const now = dependencies.now ?? (() => Date.now());
  const schedule = dependencies.setTimeout ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const cancelTimer = dependencies.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle));
  const presenceId = randomUUID();
  const presence = options.currentUserPresence
    ? presenceDisplaySchema.omit({ presenceId: true }).safeParse(options.currentUserPresence)
    : null;
  let snapshot = initialState(options.initialPage, isOnline(), options.conversationId, options.currentUserId);
  let started = false;
  let stopped = false;
  let subscribed = false;
  let startPromise: Promise<void> | null = null;
  let channel: RealtimeChannelLike | null = null;
  let catchUpRun: CatchUpRun | null = null;
  let catchUpGeneration = 0;
  let catchUpRestartScheduled = false;
  let paginationVersion = 0;
  let readAcknowledgementVersion = 0;
  let loadOlderPromise: Promise<void> | null = null;
  let readQueue: Promise<void> = Promise.resolve();
  let lastTypingSentAt = Number.NEGATIVE_INFINITY;
  let localTypingTimer: TimeoutHandle | null = null;
  const listeners = new Set<() => void>();
  const requestControllers = new Set<AbortController>();
  const drafts = new Map<string, { rpc: SendMessageInput; senderRole: MarketplaceChatSendInput['senderRole'] }>();
  const remotePresence = new Map<string, ChatTypingUser>();
  const remoteTypingTimers = new Map<string, TimeoutHandle>();

  const publish = (next: MarketplaceChatState): void => {
    if (stopped || Object.is(snapshot, next)) return;
    const confirmedCount = next.messages.filter((item) => item.status === 'sent').length;
    snapshot = {
      ...next,
      canLoadOlder: next.hasOlder && confirmedCount < MAX_CONFIRMED_MESSAGES,
    };
    for (const listener of listeners) listener();
  };

  const patchState = (patch: Partial<MarketplaceChatState>): void => {
    publish({ ...snapshot, ...patch });
  };

  const createRequestController = (): AbortController => {
    const controller = new AbortController();
    requestControllers.add(controller);
    return controller;
  };

  const releaseRequestController = (controller: AbortController): void => {
    requestControllers.delete(controller);
  };

  const settleConnection = (): void => {
    if (!isOnline()) {
      patchState({ connectionState: 'offline' });
    } else if (subscribed) {
      patchState({ connectionState: 'online', connectionError: null });
    } else {
      patchState({ connectionState: 'connecting' });
    }
  };

  const startCatchUp = (): Promise<void> => {
    if (stopped || !isOnline()) return Promise.resolve();
    const generation = ++catchUpGeneration;
    const controller = createRequestController();
    const readVersionAtRequest = readAcknowledgementVersion;
    const paginationVersionAtRequest = paginationVersion;
    const run: CatchUpRun = { generation, controller, promise: Promise.resolve() };
    catchUpRun = run;
    const promise = (async () => {
      patchState({ connectionState: 'recovering', connectionError: null });
      try {
        const incoming = await dependencies.transport.getConversationPage({
          conversationId: options.conversationId,
          limit: PAGE_LIMIT,
          cursor: null,
          signal: controller.signal,
        });
        if (
          stopped
          || controller.signal.aborted
          || catchUpGeneration !== generation
          || catchUpRun?.generation !== generation
        ) return;
        const messages = reconcileChatPage(snapshot.messages, incoming.messages);
        const paginationIsCurrent = paginationVersion === paginationVersionAtRequest;
        publish({
          ...snapshot,
          messages,
          nextCursor: paginationIsCurrent ? incoming.nextCursor : snapshot.nextCursor,
          hasOlder: paginationIsCurrent ? incoming.nextCursor !== null : snapshot.hasOlder,
          // A fetch can overlap a local read acknowledgement. Do not let
          // its older snapshot regress the cursor we already acknowledged.
          lastReadMessageId: readAcknowledgementVersion === readVersionAtRequest
            ? incoming.lastReadMessageId
            : snapshot.lastReadMessageId,
          connectionError: null,
        });
        settleConnection();
      } catch (error) {
        if (
          stopped
          || controller.signal.aborted
          || catchUpGeneration !== generation
          || catchUpRun?.generation !== generation
        ) return;
        patchState({
          connectionState: isOnline() ? 'error' : 'offline',
          connectionError: safeErrorCode(error),
        });
      } finally {
        releaseRequestController(controller);
        if (catchUpRun?.generation === generation) catchUpRun = null;
      }
    })();
    run.promise = promise;
    return promise;
  };

  const scheduleLatestCatchUp = (): void => {
    if (catchUpRestartScheduled) return;
    catchUpRestartScheduled = true;
    const restart = (): void => {
      catchUpRestartScheduled = false;
      if (!stopped && isOnline()) void startCatchUp();
    };
    if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(restart);
    else void Promise.resolve().then(restart);
  };

  const requestCatchUp = (): Promise<void> => {
    if (stopped || !isOnline()) return Promise.resolve();
    if (catchUpRun) {
      catchUpRun.controller.abort();
      catchUpGeneration += 1;
      scheduleLatestCatchUp();
      return catchUpRun.promise;
    }
    if (catchUpRestartScheduled) return Promise.resolve();
    return startCatchUp();
  };

  const broadcast = (event: BroadcastEnvelope['event'], payload: Record<string, unknown>): void => {
    if (!channel || !subscribed || stopped) return;
    fireAndForget(channel.send({ type: 'broadcast', event, payload }));
  };

  const broadcastMessageHint = (confirmed: ChatMessage): void => {
    broadcast('message_changed', {
      action: 'message_changed',
      messageId: confirmed.id,
      cursor: { createdAt: confirmed.createdAt, id: confirmed.id },
      revision: confirmed.revision,
    });
  };

  const refreshTypingUsers = (): void => {
    const typingUsers = [...remoteTypingTimers.keys()]
      .map((id) => remotePresence.get(id))
      .filter((value): value is ChatTypingUser => Boolean(value))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ar'));
    patchState({ typingUsers });
  };

  const clearRemoteTyping = (id: string): void => {
    const timer = remoteTypingTimers.get(id);
    if (timer !== undefined) cancelTimer(timer);
    remoteTypingTimers.delete(id);
  };

  const syncPresence = (): void => {
    if (!channel) return;
    remotePresence.clear();
    let state: Record<string, unknown[]>;
    try {
      state = channel.presenceState();
    } catch {
      patchState({ connectionError: 'service_unavailable' });
      return;
    }
    for (const [key, values] of Object.entries(state)) {
      if (key === options.currentUserId || !Array.isArray(values)) continue;
      for (const value of values) {
        const parsed = presenceDisplaySchema.safeParse(value);
        if (parsed.success && parsed.data.presenceId !== presenceId) {
          remotePresence.set(parsed.data.presenceId, parsed.data);
        }
      }
    }
    for (const id of [...remoteTypingTimers.keys()]) {
      if (!remotePresence.has(id)) clearRemoteTyping(id);
    }
    refreshTypingUsers();
  };

  const handleTyping = (raw: unknown): void => {
    const payload = extractPayload(raw);
    if (!payload || payload.action !== 'typing' || typeof payload.presenceId !== 'string') return;
    if (!uuidSchema.safeParse(payload.presenceId).success || payload.presenceId === presenceId) return;
    clearRemoteTyping(payload.presenceId);
    if (payload.active !== true || !remotePresence.has(payload.presenceId)) {
      refreshTypingUsers();
      return;
    }
    const id = payload.presenceId;
    remoteTypingTimers.set(id, schedule(() => {
      remoteTypingTimers.delete(id);
      refreshTypingUsers();
    }, TYPING_EXPIRY_MS));
    refreshTypingUsers();
  };

  const handleMessageHint = (raw: unknown): void => {
    const payload = extractPayload(raw);
    if (!payload) return;
    const messageId = typeof payload.messageId === 'string' ? payload.messageId : null;
    if (!messageId || !uuidSchema.safeParse(messageId).success) return;
    const known = snapshot.messages.find((item) => item.id === messageId);
    const parsedCursor = cursorSchema.safeParse(payload.cursor);
    const revision = typeof payload.revision === 'number' && Number.isSafeInteger(payload.revision)
      ? payload.revision
      : null;
    const cursorAdvanced = parsedCursor.success && shouldCatchUp(latestCursor(snapshot.messages), parsedCursor.data);
    const revisionAdvanced = revision !== null && (!known || revision > known.revision);
    // Legacy database hints contain only messageId/operation. They still force
    // an authoritative bounded fetch; newer cursor/revision hints additionally
    // detect gaps and mutations to an older visible row.
    if (!parsedCursor.success || !known || cursorAdvanced || revisionAdvanced) {
      void requestCatchUp();
    }
  };

  const handleStatus = (status: string): void => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      subscribed = true;
      patchState({ connectionState: 'recovering', connectionError: null });
      if (channel) {
        const safePresence: Record<string, unknown> = { presenceId };
        if (presence?.success) {
          safePresence.role = presence.data.role;
          safePresence.displayName = presence.data.displayName;
        }
        fireAndForget(channel.track(safePresence));
      }
      void requestCatchUp();
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      subscribed = false;
      patchState({ connectionState: isOnline() ? 'error' : 'offline', connectionError: 'service_unavailable' });
      void requestCatchUp();
      return;
    }
    if (status === 'CLOSED') {
      subscribed = false;
      patchState({ connectionState: isOnline() ? 'error' : 'offline', connectionError: 'service_unavailable' });
    }
  };

  const onFocus: EventListener = () => {
    if (!stopped && isOnline()) void requestCatchUp();
  };
  const onVisibilityChange: EventListener = () => {
    if (!stopped && documentTarget?.visibilityState !== 'hidden' && isOnline()) void requestCatchUp();
  };
  const onOnline: EventListener = () => {
    if (stopped) return;
    patchState({ connectionState: 'recovering', connectionError: null });
    void requestCatchUp();
  };
  const onOffline: EventListener = () => {
    if (!stopped) patchState({ connectionState: 'offline' });
  };

  const start = (): Promise<void> => {
    if (startPromise) return startPromise;
    if (stopped) return Promise.resolve();
    started = true;
    startPromise = (async () => {
      try {
        // With createBrowserClient this uses the configured access-token
        // callback. No token is read, copied, logged, or embedded in a topic.
        await dependencies.realtimeClient.realtime.setAuth();
      } catch {
        if (!stopped) patchState({ connectionState: 'error', connectionError: 'service_unavailable' });
        return;
      }
      if (stopped) return;
      channel = dependencies.realtimeClient.channel(`marketplace-chat:${options.conversationId}`, {
        config: {
          private: true,
          broadcast: { ack: true, self: false },
          presence: { key: options.currentUserId },
        },
      });
      channel
        .on('broadcast', { event: 'message_changed' }, handleMessageHint)
        .on('broadcast', { event: 'typing' }, handleTyping)
        .on('broadcast', { event: 'read_changed' }, () => undefined)
        .on('presence', { event: 'sync' }, syncPresence)
        .on('presence', { event: 'join' }, syncPresence)
        .on('presence', { event: 'leave' }, syncPresence)
        .subscribe(handleStatus);
      browser?.addEventListener('focus', onFocus);
      browser?.addEventListener('online', onOnline);
      browser?.addEventListener('offline', onOffline);
      documentTarget?.addEventListener('visibilitychange', onVisibilityChange);
    })();
    return startPromise;
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    subscribed = false;
    catchUpGeneration += 1;
    catchUpRun?.controller.abort();
    catchUpRun = null;
    catchUpRestartScheduled = false;
    browser?.removeEventListener('focus', onFocus);
    browser?.removeEventListener('online', onOnline);
    browser?.removeEventListener('offline', onOffline);
    documentTarget?.removeEventListener('visibilitychange', onVisibilityChange);
    if (localTypingTimer !== null) cancelTimer(localTypingTimer);
    localTypingTimer = null;
    for (const timer of remoteTypingTimers.values()) cancelTimer(timer);
    remoteTypingTimers.clear();
    for (const controller of requestControllers) controller.abort();
    requestControllers.clear();
    if (channel) {
      fireAndForget(dependencies.realtimeClient.removeChannel(channel));
      channel = null;
    }
    listeners.clear();
  };

  const markFailed = (clientMessageId: string, code: ChatErrorCode): void => {
    const failed = markOptimisticFailed(snapshot.messages, clientMessageId).map((item) => (
      item.clientMessageId === clientMessageId && item.status === 'failed'
        ? { ...item, failureCode: code }
        : item
    ));
    patchState({ messages: failed, connectionError: code });
  };

  const confirmSend = async (draft: { rpc: SendMessageInput }, clientMessageId: string): Promise<void> => {
    const controller = createRequestController();
    try {
      const confirmed = await dependencies.transport.sendMessage(draft.rpc, controller.signal);
      if (stopped || controller.signal.aborted) return;
      patchState({
        messages: reconcileChatPage(snapshot.messages, [confirmed]),
        connectionError: null,
      });
      drafts.delete(clientMessageId);
      broadcastMessageHint(confirmed);
    } catch (error) {
      if (!stopped && !controller.signal.aborted) markFailed(clientMessageId, safeErrorCode(error));
    } finally {
      releaseRequestController(controller);
    }
  };

  const send = async (input: MarketplaceChatSendInput): Promise<string | null> => {
    if (stopped) return null;
    const clientMessageId = randomUUID();
    const rpc: SendMessageInput = {
      conversationId: options.conversationId,
      clientMessageId,
      kind: input.kind,
      body: input.body,
      replyToId: input.replyToId,
      card: input.card,
    };
    const parsed = sendMessageSchema.safeParse(rpc);
    const role = z.enum(['customer', 'merchant', 'driver', 'admin']).safeParse(input.senderRole);
    if (!parsed.success || !role.success) {
      patchState({ connectionError: 'invalid_input' });
      return null;
    }
    const optimistic: ChatOptimisticMessage = {
      id: `optimistic:${clientMessageId}`,
      clientMessageId,
      conversationId: options.conversationId,
      senderId: options.currentUserId,
      senderRole: role.data,
      kind: parsed.data.kind,
      body: parsed.data.body,
      replyToId: parsed.data.replyToId,
      card: parsed.data.card && parsed.data.card.type === 'location'
        ? { ...parsed.data.card, label: 'موقع مشترك' }
        : parsed.data.card
          ? { ...parsed.data.card, label: 'بطاقة مشتركة' }
          : null,
      attachment: null,
      reactions: [],
      deleted: false,
      createdAt: new Date(now()).toISOString(),
      revision: 1,
      status: 'sending',
      failureCode: null,
    };
    drafts.set(clientMessageId, { rpc: parsed.data, senderRole: role.data });
    patchState({
      messages: reconcileChatPage(snapshot.messages, []).concat(optimistic).sort((left, right) => (
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
      )),
      connectionError: null,
    });
    await confirmSend({ rpc: parsed.data }, clientMessageId);
    return clientMessageId;
  };

  const retry = async (clientMessageId: string): Promise<void> => {
    if (stopped) return;
    const draft = drafts.get(clientMessageId);
    const failed = snapshot.messages.find((item) => (
      item.clientMessageId === clientMessageId && item.status === 'failed'
    ));
    if (!draft || !failed) return;
    patchState({
      messages: snapshot.messages.map((item) => (
        item.clientMessageId === clientMessageId
          ? { ...item, status: 'sending' as const, failureCode: null }
          : item
      )),
      connectionError: null,
    });
    await confirmSend(draft, clientMessageId);
  };

  const loadOlder = (): Promise<void> => {
    if (loadOlderPromise) return loadOlderPromise;
    if (stopped || !snapshot.nextCursor) return Promise.resolve();
    const confirmedCount = snapshot.messages.filter((item) => item.status === 'sent').length;
    const limit = Math.min(PAGE_LIMIT, MAX_CONFIRMED_MESSAGES - confirmedCount);
    if (limit <= 0) return Promise.resolve();
    const cursor = snapshot.nextCursor;
    paginationVersion += 1;
    patchState({ isLoadingOlder: true, connectionError: null });
    const controller = createRequestController();
    loadOlderPromise = dependencies.transport.getConversationPage({
      conversationId: options.conversationId,
      limit,
      cursor,
      signal: controller.signal,
    }).then((incoming) => {
      if (stopped || controller.signal.aborted) return;
      patchState({
        messages: reconcileChatPage(snapshot.messages, incoming.messages),
        nextCursor: incoming.nextCursor,
        hasOlder: incoming.nextCursor !== null,
        connectionError: null,
      });
    }).catch((error: unknown) => {
      if (!stopped && !controller.signal.aborted) patchState({ connectionError: safeErrorCode(error) });
    }).finally(() => {
      releaseRequestController(controller);
      loadOlderPromise = null;
      if (!stopped) patchState({ isLoadingOlder: false });
    });
    return loadOlderPromise;
  };

  const markRead = (messageId: string): Promise<void> => {
    const run = async (): Promise<void> => {
      if (stopped) return;
      const controller = createRequestController();
      try {
        const result = await dependencies.transport.markConversationRead({
          conversationId: options.conversationId,
          messageId,
        }, controller.signal);
        if (stopped || controller.signal.aborted || result.conversationId !== options.conversationId) return;
        readAcknowledgementVersion += 1;
        patchState({ lastReadMessageId: result.lastReadMessageId, connectionError: null });
        broadcast('read_changed', { action: 'read_changed', messageId: result.lastReadMessageId });
      } catch (error) {
        if (!stopped && !controller.signal.aborted) patchState({ connectionError: safeErrorCode(error) });
      } finally {
        releaseRequestController(controller);
      }
    };
    const queued = readQueue.then(run, run);
    readQueue = queued.catch(() => undefined);
    return queued;
  };

  const react = async (input: ChatReactionInput): Promise<void> => {
    if (stopped) return;
    const parsed = reactionSchema.safeParse(input);
    if (!parsed.success) {
      patchState({ connectionError: 'invalid_input' });
      return;
    }
    const controller = createRequestController();
    try {
      const confirmed = await dependencies.transport.setReaction(parsed.data, controller.signal);
      if (stopped || controller.signal.aborted) return;
      patchState({ messages: reconcileChatPage(snapshot.messages, [confirmed]), connectionError: null });
      broadcastMessageHint(confirmed);
    } catch (error) {
      if (!stopped && !controller.signal.aborted) patchState({ connectionError: safeErrorCode(error) });
    } finally {
      releaseRequestController(controller);
    }
  };

  const notifyTyping = (active: boolean): void => {
    if (stopped) return;
    if (localTypingTimer !== null) cancelTimer(localTypingTimer);
    localTypingTimer = null;
    if (!active) {
      broadcast('typing', { action: 'typing', presenceId, active: false });
      return;
    }
    const currentTime = now();
    if (currentTime - lastTypingSentAt >= TYPING_THROTTLE_MS) {
      lastTypingSentAt = currentTime;
      broadcast('typing', { action: 'typing', presenceId, active: true });
    }
    localTypingTimer = schedule(() => {
      localTypingTimer = null;
      broadcast('typing', { action: 'typing', presenceId, active: false });
    }, TYPING_EXPIRY_MS);
  };

  return {
    start,
    stop,
    subscribe(listener) {
      if (stopped) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    send,
    retry,
    loadOlder,
    markRead,
    react,
    notifyTyping,
  };
}

export function useMarketplaceChat(options: UseMarketplaceChatOptions) {
  const viewerKey = `${options.conversationId}:${options.currentUserId}`;
  const [state, setState] = useState<MarketplaceChatState>(() => initialState(
    options.initialPage,
    typeof navigator === 'undefined' || navigator.onLine,
    options.conversationId,
    options.currentUserId,
  ));
  const controllerRef = useRef<MarketplaceChatController | null>(null);
  const controllerKeyRef = useRef<string | null>(null);
  const committedKeyRef = useRef(viewerKey);
  useCommittedLayoutEffect(() => {
    committedKeyRef.current = viewerKey;
  }, [viewerKey]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const presenceRole = options.currentUserPresence?.role;
  const presenceName = options.currentUserPresence?.displayName;
  // Effects run after the commit. Derive the first render for a new
  // conversation from its own page so a previous conversation can never be
  // painted during that transition.
  const renderedState = state.conversationId !== options.conversationId
    || state.currentUserId !== options.currentUserId
    ? initialState(
      options.initialPage,
      typeof navigator === 'undefined' || navigator.onLine,
      options.conversationId,
      options.currentUserId,
    )
    : state;

  useEffect(() => {
    let mounted = true;
    let controller: MarketplaceChatController | null = null;
    let unsubscribe: () => void = () => undefined;
    const attachController = (dependencies: MarketplaceChatControllerDependencies): void => {
      if (!mounted) return;
      controller = createMarketplaceChatController(options, {
        ...dependencies,
      });
      controllerRef.current = controller;
      controllerKeyRef.current = viewerKey;
      setState(controller.getSnapshot());
      unsubscribe = controller.subscribe(() => {
        if (mounted && controller) setState(controller.getSnapshot());
      });
      void controller.start();
    };
    if (options.controllerDependencies) {
      attachController(options.controllerDependencies);
    } else {
      void import('../lib/supabase/client.ts').then(({ createClient }) => {
        if (!mounted) return;
        const realtimeClient = createClient() as unknown as RealtimeClientLike;
        attachController({
          realtimeClient,
          transport: createMarketplaceChatTransport(realtimeClient),
          browser: window,
          document,
          isOnline: () => navigator.onLine,
        });
      }).catch(() => {
        if (mounted) {
          setState((current) => {
            const currentKeyMatches = current.conversationId === options.conversationId
              && current.currentUserId === options.currentUserId;
            const base = currentKeyMatches
              ? current
              : initialState(
                options.initialPage,
                typeof navigator === 'undefined' || navigator.onLine,
                options.conversationId,
                options.currentUserId,
              );
            return {
              ...base,
              connectionState: 'error',
              connectionError: 'service_unavailable',
            };
          });
        }
      });
    }
    return () => {
      mounted = false;
      unsubscribe();
      controller?.stop();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        controllerKeyRef.current = null;
      }
    };
    // The scalar identity/display fields deliberately define subscription
    // lifetime. A parent recreating an equivalent initialPage must not cause a
    // duplicate channel, while a conversation/user/presence change must.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.conversationId, options.currentUserId, presenceRole, presenceName]);

  const currentController = (key: string): MarketplaceChatController | null => (
    controllerKeyRef.current === key && committedKeyRef.current === key
      ? controllerRef.current
      : null
  );
  const send = useCallback((input: MarketplaceChatSendInput) => (
    currentController(viewerKey)?.send(input) ?? Promise.resolve(null)
  ), [viewerKey]);
  const retry = useCallback((clientMessageId: string) => (
    currentController(viewerKey)?.retry(clientMessageId) ?? Promise.resolve()
  ), [viewerKey]);
  const loadOlder = useCallback(() => (
    currentController(viewerKey)?.loadOlder() ?? Promise.resolve()
  ), [viewerKey]);
  const markRead = useCallback((messageId: string) => (
    currentController(viewerKey)?.markRead(messageId) ?? Promise.resolve()
  ), [viewerKey]);
  const react = useCallback((input: ChatReactionInput) => (
    currentController(viewerKey)?.react(input) ?? Promise.resolve()
  ), [viewerKey]);
  const notifyTyping = useCallback((active: boolean) => {
    currentController(viewerKey)?.notifyTyping(active);
  }, [viewerKey]);
  const composer = useMemo<MarketplaceChatComposerContract>(() => ({
    ref: composerRef,
    onInput: () => notifyTyping(true),
    onBlur: () => notifyTyping(false),
  }), [notifyTyping]);

  return {
    ...renderedState,
    send,
    retry,
    loadOlder,
    markRead,
    react,
    notifyTyping,
    composerRef,
    composer,
  };
}
