import { chatMessageKinds, chatRoles } from './contracts.ts';
import type { ChatErrorCode, ChatMessage, ChatCursor } from './contracts.ts';

export type ChatOptimisticMessage = ChatMessage & {
  status: 'sending' | 'sent' | 'failed';
  failureCode: ChatErrorCode | null;
};

const CONFIRMED_WINDOW = 100;
const DEFAULT_FAILURE: ChatErrorCode = 'service_unavailable';
const statuses = new Set<ChatOptimisticMessage['status']>(['sending', 'sent', 'failed']);
const errorCodes = new Set<ChatErrorCode>([
  'invalid_input', 'authentication_required', 'not_found', 'closed',
  'rate_limited', 'service_unavailable',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneNested<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneNested(item)) as T;
  if (isRecord(value)) {
    const result: UnknownRecord = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneNested(item);
    return result as T;
  }
  return value;
}

function isMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && value.id.trim().length > 0
    && typeof value.conversationId === 'string'
    && value.conversationId.trim().length > 0
    && typeof value.createdAt === 'string'
    && value.createdAt.length > 0
    && (chatRoles as readonly string[]).includes(value.senderRole as string)
    && (chatMessageKinds as readonly string[]).includes(value.kind as string)
    && Array.isArray(value.reactions)
    && typeof value.deleted === 'boolean'
    && (value.clientMessageId === null || typeof value.clientMessageId === 'string');
}

function copyMessage(value: ChatMessage, status: ChatOptimisticMessage['status'] = 'sent', failureCode: ChatErrorCode | null = null): ChatOptimisticMessage {
  const message = cloneNested(value);
  if (message.deleted) {
    // A tombstone is intentionally safe to render even if an older producer
    // accidentally included private content in its payload.
    message.body = null;
    message.card = null;
    message.attachment = null;
  }
  return { ...message, status, failureCode };
}

function normalize(value: unknown, allowPending: boolean): ChatOptimisticMessage | null {
  if (!isMessage(value)) return null;
  const candidate = value as ChatMessage & Partial<Pick<ChatOptimisticMessage, 'status' | 'failureCode'>>;
  const status = allowPending && statuses.has(candidate.status as ChatOptimisticMessage['status'])
    ? candidate.status as ChatOptimisticMessage['status']
    : 'sent';
  const failureCode = status === 'failed' && typeof candidate.failureCode === 'string'
    && errorCodes.has(candidate.failureCode as ChatErrorCode)
    ? candidate.failureCode as ChatErrorCode
    : null;
  return copyMessage(candidate, status, failureCode);
}

function identity(message: ChatOptimisticMessage): string {
  if (message.clientMessageId) return `client:${message.clientMessageId}`;
  return `id:${message.id}`;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareMessages(a: ChatOptimisticMessage, b: ChatOptimisticMessage): number {
  const byTime = compareStrings(a.createdAt, b.createdAt);
  if (byTime !== 0) return byTime;
  const byId = compareStrings(a.id, b.id);
  if (byId !== 0) return byId;
  // Confirmations win a tuple tie. Pending records then have a total order by
  // client id, making display order independent of arrival order.
  if (a.status !== b.status) return a.status === 'sent' ? -1 : 1;
  return compareStrings(a.clientMessageId ?? '', b.clientMessageId ?? '');
}

function pendingRank(message: ChatOptimisticMessage): number {
  return message.status === 'sending' ? 0 : message.status === 'failed' ? 1 : 2;
}

function choose(existing: ChatOptimisticMessage, candidate: ChatOptimisticMessage): ChatOptimisticMessage {
  if (existing.status === 'sent' && candidate.status !== 'sent') return existing;
  if (candidate.status === 'sent' && existing.status !== 'sent') return candidate;
  if (existing.deleted !== candidate.deleted) return existing.deleted ? existing : candidate;
  if (existing.status !== 'sent' && candidate.status !== 'sent') {
    const byPendingStatus = pendingRank(existing) - pendingRank(candidate);
    if (byPendingStatus !== 0) return byPendingStatus < 0 ? existing : candidate;
  }
  // Different server IDs sharing an idempotency key represent the same
  // durable message; choose one deterministically rather than by arrival.
  if (existing.id !== candidate.id) return compareStrings(existing.id, candidate.id) <= 0 ? existing : candidate;
  // For the same server ID an incoming DTO is authoritative (reactions and
  // other mutable display fields are replaced, never merged).
  return candidate;
}

function trimAndSort(messages: ChatOptimisticMessage[]): ChatOptimisticMessage[] {
  const confirmed = messages.filter((message) => message.status === 'sent').sort(compareMessages);
  const pending = messages.filter((message) => message.status !== 'sent').sort(compareMessages);
  const retained = [...confirmed.slice(-CONFIRMED_WINDOW), ...pending];
  return retained.sort(compareMessages);
}

export function reconcileChatPage(
  current: ChatOptimisticMessage[],
  incoming: ChatMessage[],
): ChatOptimisticMessage[] {
  const byIdentity = new Map<string, ChatOptimisticMessage>();
  for (const value of Array.isArray(current) ? current : []) {
    const message = normalize(value, true);
    if (!message) continue;
    const key = identity(message);
    const prior = byIdentity.get(key);
    byIdentity.set(key, prior ? choose(prior, message) : message);
  }
  for (const value of Array.isArray(incoming) ? incoming : []) {
    const message = normalize(value, false);
    if (!message) continue;
    // A confirmation with the idempotency key removes every pending retry,
    // while a server message without one is deduplicated by its server ID.
    if (message.clientMessageId) {
      for (const [key, prior] of byIdentity) {
        if (prior.status !== 'sent' && prior.clientMessageId === message.clientMessageId) byIdentity.delete(key);
      }
    }
    const key = identity(message);
    const prior = byIdentity.get(key);
    byIdentity.set(key, prior ? choose(prior, message) : message);
  }
  return trimAndSort([...byIdentity.values()]);
}

export function markOptimisticFailed(
  current: ChatOptimisticMessage[],
  clientMessageId: string,
): ChatOptimisticMessage[] {
  const result: ChatOptimisticMessage[] = [];
  for (const value of Array.isArray(current) ? current : []) {
    const message = normalize(value, true);
    if (!message) continue;
    if (message.status === 'sending' && message.clientMessageId === clientMessageId) {
      result.push({ ...message, status: 'failed', failureCode: DEFAULT_FAILURE });
    } else {
      result.push(message);
    }
  }
  return trimAndSort(result);
}

export function replaceOptimisticMessage(
  current: ChatOptimisticMessage[],
  confirmed: ChatMessage,
): ChatOptimisticMessage[] {
  return reconcileChatPage(current, [confirmed]);
}

export function shouldCatchUp(
  lastCursor: ChatCursor | null | undefined,
  eventCursor: ChatCursor | null | undefined,
): boolean {
  if (!eventCursor) return false;
  if (!lastCursor) return true;
  const byTime = compareStrings(eventCursor.createdAt, lastCursor.createdAt);
  return byTime > 0 || (byTime === 0 && compareStrings(eventCursor.id, lastCursor.id) > 0);
}
