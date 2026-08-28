import type { ChatMessage, ChatRole, ChatMessageKind } from './contracts';

export type ChatMessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ChatMessageDayGroup = {
  dateKey: string;
  label: string;
  messages: ChatMessage[];
};

export type AnimateChatMessageOptions = {
  reducedMotion: boolean;
  status?: ChatMessageDeliveryStatus;
};

const ROLE_LABELS: Record<'ar' | 'en', Record<ChatRole, string>> = {
  ar: {
    customer: 'العميل',
    merchant: 'المتجر',
    driver: 'مندوب التوصيل',
    admin: 'الدعم الفني',
    system: 'النظام',
  },
  en: {
    customer: 'Customer',
    merchant: 'Merchant',
    driver: 'Driver',
    admin: 'Support',
    system: 'System',
  },
};

const KIND_LABELS: Record<'ar' | 'en', Record<ChatMessageKind, string>> = {
  ar: {
    text: 'رسالة نصية',
    image: 'صورة',
    product: 'بطاقة منتج',
    store: 'بطاقة متجر',
    order: 'بطاقة طلب',
    location: 'موقع جغرافي',
    system: 'إشعار نظام',
  },
  en: {
    text: 'Text message',
    image: 'Image',
    product: 'Product card',
    store: 'Store card',
    order: 'Order card',
    location: 'Location',
    system: 'System notice',
  },
};

const STATUS_LABELS: Record<'ar' | 'en', Record<ChatMessageDeliveryStatus, string>> = {
  ar: {
    sending: 'جارٍ الإرسال',
    failed: 'فشل الإرسال',
    sent: 'تم الإرسال',
    delivered: 'تم التسليم',
    read: 'تمت القراءة',
  },
  en: {
    sending: 'Sending',
    failed: 'Failed to send',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
  },
};

/**
 * Validates that an input is a valid ISO date timestamp string and returns the parsed Date.
 * Throws TypeError or RangeError on invalid inputs.
 */
function parseValidDate(createdAt: unknown): Date {
  if (typeof createdAt !== 'string' || createdAt.trim().length === 0) {
    throw new TypeError(`Invalid chat timestamp: expected non-empty string, got ${typeof createdAt}`);
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid chat timestamp: "${createdAt}" is not a valid ISO date`);
  }
  return date;
}

function resolveLanguage(locale?: string): 'ar' | 'en' {
  if (locale && locale.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'ar';
}

function resolveLocale(locale?: string): string {
  if (locale && locale.toLowerCase().startsWith('en')) {
    return 'en-US';
  }
  return 'ar-EG';
}

/**
 * Formats a chat message timestamp (hours:minutes) in a pure, deterministic manner.
 */
export function formatChatTimestamp(createdAt: string, locale?: string, timeZone = 'UTC'): string {
  const date = parseValidDate(createdAt);
  const targetLocale = resolveLocale(locale);
  return new Intl.DateTimeFormat(targetLocale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

/**
 * Formats a day boundary header label for grouping chat messages.
 */
export function formatChatDayLabel(createdAt: string, locale?: string, timeZone = 'UTC'): string {
  const date = parseValidDate(createdAt);
  const targetLocale = resolveLocale(locale);
  return new Intl.DateTimeFormat(targetLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(date);
}

/**
 * Groups chat messages by day in chronological order without mutating input arrays.
 * Orders messages deterministically by timestamp and ID.
 */
export function groupChatMessagesByDay(
  messages: readonly ChatMessage[],
  locale?: string,
  timeZone = 'UTC',
): ChatMessageDayGroup[] {
  if (!Array.isArray(messages)) {
    throw new TypeError('groupChatMessagesByDay: expected messages to be an array');
  }

  // Pure sort copy without mutating original array
  const sorted = [...messages].sort((left, right) => {
    const leftTime = parseValidDate(left.createdAt).getTime();
    const rightTime = parseValidDate(right.createdAt).getTime();
    const timeDiff = leftTime - rightTime;
    if (timeDiff !== 0) return timeDiff;
    return String(left.id).localeCompare(String(right.id));
  });

  const groupsMap = new Map<string, { label: string; messages: ChatMessage[] }>();

  for (const message of sorted) {
    const date = parseValidDate(message.createdAt);
    // Deterministic date key YYYY-MM-DD in the target timezone
    const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    });
    const dateKey = dateKeyFormatter.format(date);

    let group = groupsMap.get(dateKey);
    if (!group) {
      group = {
        label: formatChatDayLabel(message.createdAt, locale, timeZone),
        messages: [],
      };
      groupsMap.set(dateKey, group);
    }
    group.messages.push(message);
  }

  return Array.from(groupsMap.entries()).map(([dateKey, group]) => ({
    dateKey,
    label: group.label,
    messages: group.messages,
  }));
}

/**
 * Returns a comprehensive, accessible label describing sender, message kind, timestamp, and status.
 */
export function getChatMessageA11yLabel(
  message: ChatMessage & { status?: ChatMessageDeliveryStatus },
  locale?: string,
  timeZone = 'UTC',
): string {
  if (!message || typeof message !== 'object') {
    throw new TypeError('getChatMessageA11yLabel: expected message object');
  }

  const lang = resolveLanguage(locale);
  const time = formatChatTimestamp(message.createdAt, locale, timeZone);
  const sender = ROLE_LABELS[lang][message.senderRole] ?? (lang === 'ar' ? 'مشارك' : 'Participant');

  if (message.deleted) {
    const deletedText = lang === 'ar' ? 'رسالة محذوفة' : 'Deleted message';
    return `${sender} · ${deletedText} · ${time}`;
  }

  const kind = KIND_LABELS[lang][message.kind] ?? (lang === 'ar' ? 'رسالة' : 'Message');
  const parts = [sender, kind, time];

  if (message.status) {
    const statusText = STATUS_LABELS[lang][message.status] ?? message.status;
    parts.push(statusText);
  }

  let contentSnippet = '';
  if (message.body && message.body.trim().length > 0) {
    contentSnippet = `: "${message.body.trim()}"`;
  } else if (message.card && message.card.label) {
    contentSnippet = `: ${message.card.label}`;
  } else if (message.attachment && message.attachment.alt) {
    contentSnippet = `: ${message.attachment.alt}`;
  }

  return `${parts.join(' · ')}${contentSnippet}`;
}

/**
 * Determines whether a message is incoming, outgoing, or system generated.
 */
export function getChatMessageDirection(
  message: Pick<ChatMessage, 'senderId' | 'senderRole'>,
  currentUserId: string | null | undefined,
): 'incoming' | 'outgoing' | 'system' {
  if (!message || typeof message !== 'object') {
    throw new TypeError('getChatMessageDirection: expected message object');
  }
  if (message.senderRole === 'system') {
    return 'system';
  }
  if (currentUserId && message.senderId === currentUserId) {
    return 'outgoing';
  }
  return 'incoming';
}

/**
 * Pure helper determining whether a message entrance animation should play.
 * Guarantees false whenever reduced motion is enabled or when status is failed.
 */
export function shouldAnimateChatMessage(options: AnimateChatMessageOptions): boolean {
  if (!options || typeof options !== 'object') {
    throw new TypeError('shouldAnimateChatMessage: expected options object');
  }
  if (options.reducedMotion) {
    return false;
  }
  if (options.status === 'failed') {
    return false;
  }
  return true;
}
