export const chatRoles = ['customer', 'merchant', 'driver', 'admin', 'system'] as const;
export const chatConversationKinds = ['presale', 'order', 'support', 'dispute'] as const;
export const chatMessageKinds = ['text', 'image', 'product', 'store', 'order', 'location', 'system'] as const;

export type ChatRole = (typeof chatRoles)[number];
export type ChatConversationKind = (typeof chatConversationKinds)[number];
export type ChatMessageKind = (typeof chatMessageKinds)[number];
export type ChatUserMessageKind = Exclude<ChatMessageKind, 'system'>;
export type ChatCursor = { createdAt: string; id: string };

export type ChatMessage = {
  id: string; clientMessageId: string | null; conversationId: string; senderId: string | null;
  senderRole: ChatRole; kind: ChatMessageKind; body: string | null; replyToId: string | null;
  card: { type: 'product' | 'store' | 'order'; id: string; label: string } |
    { type: 'location'; latitude: number; longitude: number; label: string } | null;
  attachment: { id: string; url: string; width: number; height: number; alt: string } | null;
  reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  deleted: boolean; createdAt: string; revision: number;
};

export type ChatConversationSummary = {
  id: string; publicCode: string; kind: ChatConversationKind;
  status: 'open' | 'waiting_customer' | 'waiting_support' | 'resolved' | 'closed' | 'paused';
  subject: string; store: { id: string; name: string } | null;
  order: { id: string; publicCode: string } | null;
  counterpart: { displayName: string; role: ChatRole; avatarUrl: string | null } | null;
  lastMessageAt: string; unreadCount: number;
};
export type ChatConversationPage = { items: ChatConversationSummary[]; nextCursor: ChatCursor | null };
export type ChatMessagePage = { conversation: ChatConversationSummary; messages: ChatMessage[]; nextCursor: ChatCursor | null; lastReadMessageId: string | null };
export type ChatErrorCode = 'invalid_input' | 'authentication_required' | 'not_found' | 'closed' | 'rate_limited' | 'service_unavailable';
export type ChatActionState = { status: 'idle' | 'sent' } | { status: 'error'; code: ChatErrorCode };

export type ChatCardInput = { type: 'product' | 'store' | 'order'; id: string } | { type: 'location'; latitude: number; longitude: number };
export type SendMessageInput = { conversationId: string; clientMessageId: string; kind: ChatUserMessageKind; body: string | null; replyToId: string | null; card: ChatCardInput | null };
export type ConversationIntent = { kind: 'presale'; storeId: string; productId: string | null } | { kind: 'order'; orderId: string };
export type ChatSearchInput = { conversationId: string; query: string; limit: number; cursor: ChatCursor | null };
export type ChatReactionInput = { messageId: string; emoji: '👍' | '❤️' | '✅' | '🙏' | '😄'; active: boolean };
