# DAIRTAK Unified Marketplace Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Google-authenticated, Realtime marketplace chat for customers, merchants, assigned drivers, and monitored administrators while preserving the existing DAIRTAK support and notification systems.

**Architecture:** Extend the existing `support_threads`, `support_messages`, and notification foundation with durable participants, idempotent RPC writes, private Realtime delivery, and role-specific Next.js inboxes. The old Supabase project is the sole production source of truth; all additive migrations are rehearsed on Staging before a separately approved production application.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, HeroUI 3, Supabase Postgres/Auth/Realtime/Storage, Zod 4, Resend, Web Push, Node test runner, Supabase pgTAP, Playwright, axe.

**Spec:** `docs/superpowers/specs/2026-08-24-unified-marketplace-chat-design.md`

## Global Constraints

- Production source of truth: Supabase `gkpogxmyioleypzrceib`; Staging rehearsal only: `swsobooavcvmyejsuwlg`.
- Never dual-write, join, or synchronize sessions across the two Supabase projects.
- No production database mutation or feature activation without a separate explicit confirmation after Staging acceptance.
- Keep Next.js at `16.2.12`, React at `19.2.8`, Node at `22.x`, and HeroUI at `3.2.3` during this feature.
- Google authentication is mandatory before chat, checkout, or order creation; anonymous users may only browse and retain a guest cart.
- Preserve current support records and routes during migration; initial rollout is additive and feature-flagged.
- Authorization derives from durable profiles, store membership, delivery assignment, admin capabilities, and AAL2; never from `user_metadata`.
- Maximum text length is 5,000 Unicode characters. Accepted chat images are JPEG, PNG, WebP, or AVIF, at most 8 MiB and 4,096 pixels per side.
- Chat attachments remain private and use short-lived signed access. Exact addresses, message bodies, signed URLs, and credentials never enter logs or analytics.
- Retain closed messages for 365 days, sender-deleted originals for 90 days, and monitoring audit records for 730 days.
- No voice, video, arbitrary user-to-user chat, external chat provider, paid SMS, or unrelated framework upgrade in this release.
- Resend currently has no configured domains (read-only check on 2026-08-24); email readiness stays closed until the user approves domain setup and DNS verification.
- Every task follows red-green-refactor, runs its focused tests, then commits only its own files.

## File Structure

### Core contracts and server boundary

- `lib/commerce/chat/contracts.ts`: Zod wire schemas and exported chat domain types.
- `lib/commerce/chat/input.ts`: bounded FormData/JSON parsers for sends, reactions, searches, reports, and moderation.
- `lib/commerce/chat/service.ts`: server-only authenticated RPC adapter and DTO mapping.
- `lib/commerce/chat/actions.ts`: Server Actions that call the service and return stable action states.
- `lib/commerce/chat/reconcile.ts`: pure optimistic-message and cursor reconciliation functions.

### Client and UI

- `hooks/useMarketplaceChat.ts`: private Realtime subscription, Presence, reconnect, and reconciliation orchestration.
- `components/marketplace/chat/chat-shell.tsx`: responsive inbox/conversation composition.
- `components/marketplace/chat/conversation-list.tsx`: inbox rows, filters, unread counts, and empty states.
- `components/marketplace/chat/message-list.tsx`: cursor history, unread anchor, scroll preservation, and announcements.
- `components/marketplace/chat/message-card.tsx`: text, system events, cards, tombstones, reactions, and status.
- `components/marketplace/chat/message-composer.tsx`: text, reply, image, location consent, send, cancel, and retry.
- `components/marketplace/chat/chat.module.css`: DAIRTAK RTL/mobile/desktop layout and reduced-motion rules.

### Routes and integrations

- `app/account/chat/page.tsx`, `app/account/chat/[id]/page.tsx`: customer inbox and conversation.
- `app/merchant/marketplace/chat/page.tsx`, `app/merchant/marketplace/chat/[id]/page.tsx`: merchant inbox and conversation.
- `app/driver/marketplace/chat/page.tsx`, `app/driver/marketplace/chat/[id]/page.tsx`: driver inbox and conversation.
- `app/admin/marketplace/chat/page.tsx`, `app/admin/marketplace/chat/[id]/page.tsx`: AAL2 monitoring inbox and conversation.
- Existing store, product, order, merchant-order, and driver-order surfaces: contextual authenticated chat entry points.

### Attachments, monitoring, and delivery

- `lib/commerce/chat/media.ts`: private-object keys, media validation, signed upload/read, completion, and quarantine.
- `app/api/marketplace/chat/attachments/route.ts`: same-origin authenticated attachment initiate/complete/delete API.
- `lib/commerce/chat/risk.ts`: deterministic risk signals and safe excerpts for the monitoring queue.
- `lib/commerce/chat/email-worker.ts`: claim/send/complete/fail Resend email jobs.
- `app/api/cron/chat-email/route.ts`: timing-safe cron endpoint.
- `.env.example`, `lib/env/server.ts`, `scripts/check-env.mjs`: Resend and chat feature contract.

### Database and verification

- Create through `supabase migration new unified_marketplace_chat_core`: additive conversation schema, participants, RPCs, RLS, Realtime authorization, and compatibility.
- Create through `supabase migration new marketplace_chat_private_media`: attachment metadata, private-object authorization, quarantine, and cleanup claims.
- Create through `supabase migration new marketplace_chat_monitoring_notifications`: audit, risk, report, email-outbox, retention, worker scheduling, and indexes.
- Create through `supabase migration new marketplace_chat_release_marker`: exact release capability marker.
- `supabase/tests/rls_contract.sql`: executable role/access matrix.
- Focused Node tests under `tests/commerce/chat-*.test.mjs` and browser journeys under `e2e/marketplace-chat.spec.ts`.

---

### Task 1: Freeze Chat Contracts and Input Validation

**Files:**
- Create: `lib/commerce/chat/contracts.ts`
- Create: `lib/commerce/chat/input.ts`
- Create: `tests/commerce/chat-contracts.test.mjs`

**Interfaces:**
- Produces: `ChatRole`, `ChatConversationKind`, `ChatMessageKind`, `ChatMessage`, `ChatConversationSummary`, `ChatConversationPage`, `ChatMessagePage`, `ChatActionState`.
- Produces: `SendMessageInput`, `ConversationIntent`, `ChatSearchInput`, and `ChatReactionInput` as the only accepted mutation/query inputs.
- Produces: `parseSendMessageForm(formData)`, `parseConversationIntent(input)`, `parseReactionInput(input)`, `parseChatSearchInput(input)`, `parseDeleteMessageInput(input)`, `parseChatPreferencesInput(input)`, `parseChatBlockInput(input)`, and `parseChatReportInput(input)`.

- [ ] **Step 1: Write failing contract tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseChatSearchInput,
  parseConversationIntent,
  parseSendMessageForm,
} from '../../lib/commerce/chat/input.ts';

test('message input accepts one bounded payload and a UUID idempotency key', () => {
  const form = new FormData();
  form.set('conversationId', 'bf3d2637-adf4-45ac-8f11-c6576e84bf47');
  form.set('clientMessageId', '43f88cb0-b6fd-4c6a-96ca-61e04d85aff6');
  form.set('body', 'هل المنتج متاح؟');
  const parsed = parseSendMessageForm(form);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.kind, 'text');
});

test('intent permits presale store chat and order chat only', () => {
  assert.equal(parseConversationIntent({ kind: 'presale', storeId: crypto.randomUUID() }).success, true);
  assert.equal(parseConversationIntent({ kind: 'order', orderId: crypto.randomUUID() }).success, true);
  assert.equal(parseConversationIntent({ kind: 'direct', userId: crypto.randomUUID() }).success, false);
});

test('search and message bodies are bounded', () => {
  assert.equal(parseChatSearchInput({ query: 'سعر المنتج', limit: 30 }).success, true);
  assert.equal(parseChatSearchInput({ query: 'x'.repeat(201), limit: 30 }).success, false);
  const form = new FormData();
  form.set('conversationId', crypto.randomUUID());
  form.set('clientMessageId', crypto.randomUUID());
  form.set('body', 'x'.repeat(5001));
  assert.equal(parseSendMessageForm(form).success, false);
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/commerce/chat-contracts.test.mjs`  
Expected: FAIL because `lib/commerce/chat/input.ts` does not exist.

- [ ] **Step 3: Add exact wire schemas and parsers**

```ts
export const chatRoles = ['customer', 'merchant', 'driver', 'admin', 'system'] as const;
export const chatConversationKinds = ['presale', 'order', 'support', 'dispute'] as const;
export const chatMessageKinds = ['text', 'image', 'product', 'store', 'order', 'location', 'system'] as const;

export type ChatRole = (typeof chatRoles)[number];
export type ChatConversationKind = (typeof chatConversationKinds)[number];
export type ChatMessageKind = (typeof chatMessageKinds)[number];

export type ChatMessage = {
  id: string;
  clientMessageId: string | null;
  conversationId: string;
  senderId: string | null;
  senderRole: ChatRole;
  kind: ChatMessageKind;
  body: string | null;
  replyToId: string | null;
  card:
    | { type: 'product' | 'store' | 'order'; id: string; label: string }
    | { type: 'location'; latitude: number; longitude: number; label: string }
    | null;
  attachment: { id: string; url: string; width: number; height: number; alt: string } | null;
  reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  deleted: boolean;
  createdAt: string;
};

export type ChatCursor = { createdAt: string; id: string };

export type ChatConversationSummary = {
  id: string;
  publicCode: string;
  kind: ChatConversationKind;
  status: 'open' | 'waiting_customer' | 'waiting_support' | 'resolved' | 'closed' | 'paused';
  subject: string;
  store: { id: string; name: string } | null;
  order: { id: string; publicCode: string } | null;
  counterpart: { displayName: string; role: ChatRole; avatarUrl: string | null } | null;
  lastMessageAt: string;
  unreadCount: number;
};

export type ChatConversationPage = {
  items: ChatConversationSummary[];
  nextCursor: ChatCursor | null;
};

export type ChatMessagePage = {
  conversation: ChatConversationSummary;
  messages: ChatMessage[];
  nextCursor: ChatCursor | null;
  lastReadMessageId: string | null;
};

export type ChatErrorCode = 'invalid_input' | 'authentication_required' | 'not_found' | 'closed' | 'rate_limited' | 'service_unavailable';

export type ChatActionState =
  | { status: 'idle' | 'sent' }
  | { status: 'error'; code: ChatErrorCode };

export type ChatCardInput =
  | { type: 'product' | 'store' | 'order'; id: string }
  | { type: 'location'; latitude: number; longitude: number };

export type SendMessageInput = {
  conversationId: string;
  clientMessageId: string;
  kind: ChatMessageKind;
  body: string | null;
  replyToId: string | null;
  card: ChatCardInput | null;
};

export type ConversationIntent =
  | { kind: 'presale'; storeId: string; productId: string | null }
  | { kind: 'order'; orderId: string };

export type ChatSearchInput = { conversationId: string; query: string; limit: number; cursor: ChatCursor | null };
export type ChatReactionInput = { messageId: string; emoji: '👍' | '❤️' | '✅' | '🙏' | '😄'; active: boolean };
```

Use Zod UUID, discriminated-union, URL-free card, 5,000-character body, 200-character search, 1–50 page limit, and a fixed reaction allowlist of `👍`, `❤️`, `✅`, `🙏`, and `😄`.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `node --test tests/commerce/chat-contracts.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit contracts**

```bash
git add lib/commerce/chat/contracts.ts lib/commerce/chat/input.ts tests/commerce/chat-contracts.test.mjs
git commit -m "feat: define marketplace chat contracts"
```

### Task 2: Add the Durable Conversation Schema and Participant-Scoped RPCs

**Files:**
- Create via CLI: the migration printed by `npx supabase migration new unified_marketplace_chat_core`
- Modify: `supabase/tests/rls_contract.sql`
- Create: `tests/commerce/chat-database-contract.test.mjs`

**Interfaces:**
- Consumes: conversation/message enum values from Task 1 as the TypeScript mirror of SQL checks.
- Produces RPCs: `open_my_marketplace_conversation(uuid, uuid, text)`, `list_my_marketplace_conversations(text, integer, timestamptz, uuid)`, `get_my_marketplace_conversation_page(uuid, integer, timestamptz, uuid)`, `search_my_marketplace_chat_messages(uuid, text, integer, timestamptz, uuid)`, `send_my_marketplace_chat_message(uuid, uuid, text, text, uuid, jsonb)`, `set_my_marketplace_chat_read_cursor(uuid, uuid)`, `react_to_my_marketplace_chat_message(uuid, text, boolean)`, `delete_my_marketplace_chat_message(uuid)`, `set_my_marketplace_chat_preferences(uuid, timestamptz)`, and `block_my_marketplace_chat_counterparty(uuid, uuid, boolean)`.

- [ ] **Step 0: Verify current Supabase behavior before writing SQL**

Fetch `https://supabase.com/changelog.md`, scan relevant Realtime/Auth/Storage breaking changes, then use Supabase documentation search for private-channel authorization, Broadcast from Postgres, Presence, and RLS. Record the supporting official URLs in the migration comments and PR evidence; do not copy an outdated policy shape from this plan if the current official contract differs.

- [ ] **Step 1: Create the migration with the CLI**

Run: `npx supabase migration new unified_marketplace_chat_core`  
Expected: one new empty migration ending `_unified_marketplace_chat_core.sql`. Use that exact generated path for the rest of this task.

- [ ] **Step 2: Write failing source and pgTAP contracts**

The Node test must locate the single migration by suffix and assert these security properties:

```js
assert.match(sql, /create table public\.marketplace_chat_participants/);
assert.match(sql, /primary key \(thread_id, user_id, participant_role\)/);
assert.match(sql, /client_message_id uuid/);
assert.match(sql, /create unique index support_messages_sender_client_key/);
assert.match(sql, /create or replace function public\.send_my_marketplace_chat_message/);
assert.match(sql, /select auth\.uid\(\)/);
assert.match(sql, /revoke all on table public\.support_messages from public, anon, authenticated/);
assert.doesNotMatch(sql, /auth\.jwt\(\).*user_metadata/su);
```

Append pgTAP cases that authenticate representative customer, unrelated customer, merchant, assigned driver, replaced driver, admin without `chat_monitor`, and AAL2 monitor. Assert allowed participants receive the row and every unrelated role receives no row or a stable `not_found` error.

- [ ] **Step 3: Run tests and verify red**

Run: `node --test tests/commerce/chat-database-contract.test.mjs`  
Expected: FAIL because the migration has no schema or RPC definitions.

- [ ] **Step 4: Implement the additive schema**

The migration must:

```sql
alter table public.support_threads
  add column if not exists conversation_kind text not null default 'support'
    check (conversation_kind in ('presale', 'order', 'support', 'dispute')),
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references auth.users(id) on delete set null;

create table public.marketplace_chat_participants (
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('customer', 'merchant', 'driver', 'admin')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  last_read_message_id uuid,
  muted_until timestamptz,
  counterparty_blocked_at timestamptz,
  primary key (thread_id, user_id, participant_role),
  check (removed_at is null or removed_at >= joined_at)
);

alter table public.support_messages
  add column if not exists client_message_id uuid,
  add column if not exists message_kind text not null default 'text'
    check (message_kind in ('text', 'image', 'product', 'store', 'order', 'location', 'system')),
  add column if not exists reply_to_id uuid references public.support_messages(id) on delete set null,
  add column if not exists card_data jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_body text;

alter table public.support_messages drop constraint if exists support_messages_sender_kind_check;
alter table public.support_messages add constraint support_messages_sender_kind_check
  check (sender_kind in ('customer', 'merchant', 'driver', 'admin', 'system'));

alter table public.marketplace_chat_participants
  add constraint marketplace_chat_participants_last_read_fk
  foreign key (last_read_message_id) references public.support_messages(id) on delete set null;

create table public.marketplace_chat_reactions (
  message_id uuid not null references public.support_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '✅', '🙏', '😄')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create unique index support_messages_sender_client_key
  on public.support_messages(thread_id, sender_user_id, client_message_id)
  where client_message_id is not null;
```

Backfill participant rows from existing customers, active store memberships, and assigned administrators. Keep legacy support functions callable until Task 6 switches every existing route.

Every `SECURITY DEFINER` function must use `set search_path = ''`, check `auth.uid()`, derive roles from durable tables, return `not_found` for inaccessible identifiers, apply keyset bounds, and receive explicit grants only after `REVOKE ALL` from `PUBLIC`, `anon`, and unrelated roles.

- [ ] **Step 5: Add private Realtime authorization and assignment synchronization**

Create a topic contract `marketplace-chat:<thread_uuid>`. Authorization must reuse an internal participant predicate. Delivery-assignment triggers add the new driver participant and set `removed_at` for the previous driver in the same transaction.

```sql
create or replace function public.sync_marketplace_chat_driver_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.marketplace_chat_participants
     set removed_at = coalesce(removed_at, now())
   where thread_id in (select id from public.support_threads where order_id = new.order_id)
     and participant_role = 'driver'
     and user_id is distinct from new.assigned_driver_id
     and removed_at is null;
  if new.assigned_driver_id is not null then
    insert into public.marketplace_chat_participants(thread_id, user_id, participant_role)
    select id, new.assigned_driver_id, 'driver'
      from public.support_threads where order_id = new.order_id
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null, joined_at = now();
  end if;
  return new;
end;
$$;
```

- [ ] **Step 6: Verify locally**

Run: `npx supabase db reset --local`  
Run: `npx supabase test db`  
Run: `node --test tests/commerce/chat-database-contract.test.mjs`  
Expected: all pass; unrelated users and former drivers cannot read, send, sign media, or subscribe.

- [ ] **Step 7: Commit the database foundation**

```bash
git add supabase/migrations supabase/tests/rls_contract.sql tests/commerce/chat-database-contract.test.mjs
git commit -m "feat: add participant-scoped marketplace chat database"
```

### Task 3: Build the Server Chat Service and Idempotent Actions

**Files:**
- Create: `lib/commerce/chat/service.ts`
- Create: `lib/commerce/chat/actions.ts`
- Modify: `lib/commerce/operations.ts`
- Modify: `lib/commerce/operations-actions.ts`
- Create: `tests/commerce/chat-service.test.mjs`

**Interfaces:**
- Consumes: Task 1 contracts and Task 2 RPCs.
- Produces: `openConversation(intent)`, `listConversations(input)`, `getConversationPage(input)`, `sendMessage(input)`, `markConversationRead(input)`, `setReaction(input)`.
- Produces: `searchConversationMessages(input)`, `deleteMessage(input)`, `setConversationPreferences(input)`, and `setConversationBlock(input)`.
- Produces Server Actions: `openMarketplaceConversationAction`, `sendMarketplaceChatMessageAction`, `markMarketplaceConversationReadAction`, `reactMarketplaceChatMessageAction`, `deleteMarketplaceChatMessageAction`, `setMarketplaceChatPreferencesAction`, and `setMarketplaceChatBlockAction`.

- [ ] **Step 1: Write failing service-boundary tests**

Assert `service.ts` imports `server-only`, verifies `supabase.auth.getUser()`, calls only the Task 2 RPC names, parses every response with Task 1 Zod schemas, never accepts `senderId` or `senderRole`, and maps provider errors to stable `ChatActionState` codes without returning raw messages.

- [ ] **Step 2: Run the test and verify red**

Run: `node --test tests/commerce/chat-service.test.mjs`  
Expected: FAIL because the service files do not exist.

- [ ] **Step 3: Implement the server service**

```ts
export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const supabase = await authenticatedChatClient();
  const { data, error } = await supabase.rpc('send_my_marketplace_chat_message', {
    p_thread_id: input.conversationId,
    p_client_message_id: input.clientMessageId,
    p_kind: input.kind,
    p_body: input.body,
    p_reply_to_id: input.replyToId,
    p_card_data: input.card,
  });
  if (error) throw mapChatRpcError(error);
  return parseChatMessage(data);
}
```

Keep deprecated support exports as compatibility wrappers over the new service until all old pages are migrated in Task 8.

Define internal `authenticatedChatClient()`, `parseChatMessage(value)`, and `mapChatRpcError(error)` in this file. `mapChatRpcError` maps only stable database codes to the Task 1 error union and maps every unknown provider/database message to `service_unavailable`.

- [ ] **Step 4: Implement Server Actions with safe destinations**

Actions parse input, call the service, revalidate only role-specific chat routes, and never redirect to an unvalidated external path. Return serializable action state for optimistic UI instead of throwing provider details.

```ts
'use server';

export async function sendMarketplaceChatMessageAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const parsed = parseSendMessageForm(formData);
  if (!parsed.success) return { status: 'error', code: 'invalid_input' };
  try {
    await sendMessage(parsed.data);
    revalidatePath('/account/chat');
    return { status: 'sent' };
  } catch (error) {
    return toChatActionState(error);
  }
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node --test tests/commerce/chat-contracts.test.mjs tests/commerce/chat-service.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit the server boundary**

```bash
git add lib/commerce/chat lib/commerce/operations.ts lib/commerce/operations-actions.ts tests/commerce/chat-service.test.mjs
git commit -m "feat: add marketplace chat server boundary"
```

### Task 4: Enforce Google-First Chat and Checkout Intent Recovery

**Files:**
- Modify: `lib/auth/safe-next.ts`
- Modify: `lib/auth/oauth-actions.ts`
- Modify: `app/auth/callback/route.ts`
- Modify: `components/auth/GoogleSignInButton.tsx`
- Modify: `components/marketplace/checkout-form.tsx`
- Modify: `app/marketplace/cart/claim/route.ts`
- Create: `components/marketplace/chat/chat-entry-button.tsx`
- Create: `tests/commerce/chat-auth-intent.test.mjs`

**Interfaces:**
- Consumes: `openMarketplaceConversationAction` from Task 3.
- Produces: `createChatLoginHref({ returnTo, intent })` and a signed, same-origin intent cookie containing only `presale/storeId/productId` or `order/orderId`.

- [ ] **Step 1: Write failing auth-intent tests**

Cover anonymous checkout, anonymous store chat, anonymous product chat, OAuth cancellation, invalid external `next`, expired intent, cross-tab completion, and an authenticated user returning to the exact intended page.

```js
assert.equal(sanitizeNextPath('https://evil.example/chat', '/marketplace'), '/marketplace');
assert.equal(sanitizeNextPath('/account/chat?store=valid', '/marketplace'), '/account/chat?store=valid');
```

Also assert no checkout submission path uses an anonymous/service-role fallback.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-auth-intent.test.mjs`  
Expected: FAIL because chat intent recovery is absent.

- [ ] **Step 3: Implement signed intent preservation**

Use a short-lived HttpOnly, SameSite=Lax, Secure production cookie. Validate intent UUIDs and allowlisted routes before OAuth, consume it once after callback, and preserve the existing guest-cart claim flow.

```ts
const chatIntentCookie = {
  name: 'dairtak_chat_intent',
  options: { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 },
};

export function createChatLoginHref(input: { returnTo: string; intent: ConversationIntent }): string {
  const next = sanitizeNextPath(input.returnTo, '/marketplace');
  return `/signin?next=${encodeURIComponent(next)}&intent=chat`;
}
```

- [ ] **Step 4: Make Google the primary checkout/chat action**

The login cards use the existing `GoogleSignInButton`, Arabic copy, and a secondary retry/cancel recovery state. Google profile fields may prefill customer name/email/avatar, but the server creates role-neutral customer records and leaves merchant/driver approval unchanged.

```tsx
<GoogleSignInButton next={loginHref} label="المتابعة باستخدام Google" />
<p className={styles.helper}>سنرجعك لنفس المحادثة أو السلة بعد تسجيل الدخول.</p>
```

- [ ] **Step 5: Verify auth flows**

Run: `node --test tests/account-workflow.test.mjs tests/commerce/checkout-integration.test.mjs tests/commerce/chat-auth-intent.test.mjs`  
Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit auth intent recovery**

```bash
git add lib/auth app/auth components/auth components/marketplace/checkout-form.tsx components/marketplace/chat/chat-entry-button.tsx app/marketplace/cart/claim/route.ts tests/commerce/chat-auth-intent.test.mjs
git commit -m "feat: preserve google-first chat and checkout intent"
```

### Task 5: Implement Pure Reconciliation Before Realtime Effects

**Files:**
- Create: `lib/commerce/chat/reconcile.ts`
- Create: `tests/commerce/chat-reconcile.test.mjs`

**Interfaces:**
- Produces: `ChatOptimisticMessage`, `reconcileChatPage(current, incoming)`, `markOptimisticFailed(current, clientMessageId)`, `replaceOptimisticMessage(current, confirmed)`, `shouldCatchUp(lastCursor, eventCursor)`.

`ChatOptimisticMessage` extends the Task 1 `ChatMessage` display contract with `status: 'sending' | 'sent' | 'failed'` and `failureCode: ChatErrorCode | null`; confirmed messages always use `sent`.

- [ ] **Step 1: Write failing reducer tests**

Test optimistic insert, duplicate broadcast, retry confirmation, out-of-order event, older-page prepend, deletion tombstone, reaction replacement, stable chronological ordering, and 100-message client window trimming without losing pending messages.

```js
const reconciled = reconcileChatPage(
  [{ id: 'optimistic:abc', clientMessageId: clientId, status: 'sending', createdAt: later }],
  [{ id: serverId, clientMessageId: clientId, status: 'sent', createdAt: earlier }],
);
assert.equal(reconciled.length, 1);
assert.equal(reconciled[0].id, serverId);
```

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-reconcile.test.mjs`  
Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Implement deterministic pure functions**

Use `clientMessageId` for optimistic replacement and `(createdAt, id)` for confirmed ordering. Do not read time, network, DOM, or Supabase inside this module.

```ts
export function replaceOptimisticMessage(
  current: ChatOptimisticMessage[],
  confirmed: ChatMessage,
): ChatOptimisticMessage[] {
  const withoutRetry = current.filter((item) =>
    !confirmed.clientMessageId || item.clientMessageId !== confirmed.clientMessageId);
  return sortConfirmed([...withoutRetry, { ...confirmed, status: 'sent', failureCode: null }]);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `node --test tests/commerce/chat-reconcile.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit reconciliation**

```bash
git add lib/commerce/chat/reconcile.ts tests/commerce/chat-reconcile.test.mjs
git commit -m "feat: add deterministic chat reconciliation"
```

### Task 6: Add Private Realtime, Presence, and Reconnect Catch-Up

**Files:**
- Create: `hooks/useMarketplaceChat.ts`
- Create: `tests/commerce/chat-realtime.test.mjs`

**Interfaces:**
- Consumes: Task 3 service actions and Task 5 reconciliation.
- Produces: `useMarketplaceChat({ conversationId, initialPage, currentUserId })` returning messages, connection state, typing users, send/retry/loadOlder/markRead/react methods, and a composer ref contract.

- [ ] **Step 1: Write failing lifecycle/source tests**

Assert the hook subscribes only to `marketplace-chat:${conversationId}`, never places a token or user ID in the topic, removes the channel on cleanup, catches up on `SUBSCRIBED`, tab focus, online, and sequence gaps, and expires typing state after 4 seconds.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-realtime.test.mjs`  
Expected: FAIL because the hook is absent.

- [ ] **Step 3: Implement the hook**

```ts
type ChatConnectionState = 'connecting' | 'online' | 'offline' | 'recovering' | 'error';

const channel = supabase.channel(`marketplace-chat:${conversationId}`, {
  config: { private: true, presence: { key: currentUserId } },
});
```

Broadcast payloads contain message IDs and cursors, not complete private bodies. Fetch authoritative DTOs after events. Presence contains only role-safe display state. Abort stale catch-up requests and serialize cursor advancement.

- [ ] **Step 4: Verify lifecycle and browser-safe boundaries**

Run: `node --test tests/commerce/chat-realtime.test.mjs tests/commerce/chat-reconcile.test.mjs`  
Run: `npm run typecheck`  
Expected: PASS with no server-only import crossing into the hook.

- [ ] **Step 5: Commit Realtime transport**

```bash
git add hooks/useMarketplaceChat.ts tests/commerce/chat-realtime.test.mjs
git commit -m "feat: add private realtime chat transport"
```

### Task 7: Build the Accessible HeroUI Chat Experience

**Files:**
- Create: `components/marketplace/chat/chat-shell.tsx`
- Create: `components/marketplace/chat/conversation-list.tsx`
- Create: `components/marketplace/chat/message-list.tsx`
- Create: `components/marketplace/chat/message-card.tsx`
- Create: `components/marketplace/chat/message-composer.tsx`
- Create: `components/marketplace/chat/chat.module.css`
- Create: `tests/commerce/chat-ui.test.mjs`

**Interfaces:**
- Consumes: Task 1 types and Task 6 hook.
- Produces: `<MarketplaceChatShell initialInbox initialConversation role basePath />`.

- [ ] **Step 1: Write failing UI contract tests**

Assert HeroUI v3 uses `isPending`/`isDisabled`, composer label association, `aria-live="polite"` only for connection and send failures, 44px minimum controls, `prefers-reduced-motion`, RTL-safe logical properties, safe-area inset, visible focus, empty/offline/closed/paused states, search, mute/report/block controls, and no external contact links.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-ui.test.mjs`  
Expected: FAIL because chat components do not exist.

- [ ] **Step 3: Build the responsive shell and inbox**

Desktop renders a two-column grid with a bounded conversation list. Mobile renders one route-level surface at a time. Inbox rows expose participant/store, safe last-message summary, unread badge, time, order code, connection/risk state where authorized, and a real empty state.

```tsx
export function MarketplaceChatShell(props: MarketplaceChatShellProps) {
  return (
    <main className={styles.shell} data-has-conversation={Boolean(props.initialConversation)}>
      <ConversationList items={props.initialInbox.items} basePath={props.basePath} />
      <section aria-label="المحادثة" className={styles.conversationPane}>
        {props.initialConversation ? <ChatConversation {...props} /> : <ChatEmptyState />}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Build message history and composer**

Use semantic lists, `<time dateTime>`, `<bdi>` for codes, explicit sender labels where visual grouping would be ambiguous, and `scrollIntoView` only when the user is at the latest edge. Preserve scroll offset when older pages prepend. Optimistic, failed, deleted, system, card, image, reply, reaction, and read states each have distinct accessible copy.

```tsx
<ol aria-label="رسائل المحادثة" className={styles.messages} ref={listRef}>
  {messages.map((message) => <MessageCard key={message.id} message={message} />)}
</ol>
<form action={sendAction} className={styles.composer}>
  <Label.Root htmlFor="chat-body">اكتب رسالة</Label.Root>
  <TextArea.Root id="chat-body" name="body" maxLength={5000} required />
  <Button.Root type="submit" isPending={pending} isDisabled={!canSend}>إرسال</Button.Root>
</form>
```

The conversation menu opens a HeroUI drawer for bounded server search and exposes mute, report, and block actions. Blocking a participant during an active delivery calls the database RPC, which refuses a communication blackout, creates a constrained support escalation, and returns safe copy explaining that order-support messages remain available.

- [ ] **Step 5: Add restrained motion**

Use CSS transitions between 120ms and 180ms for row selection, send acknowledgement, reaction, and drawers. Disable transition and smooth scrolling inside `@media (prefers-reduced-motion: reduce)`.

```css
.message { transition: opacity 150ms ease, transform 150ms ease; }
.composer { padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }
@media (prefers-reduced-motion: reduce) {
  .message { transition: none; }
  .messages { scroll-behavior: auto; }
}
```

- [ ] **Step 6: Verify components**

Run: `node --test tests/commerce/chat-ui.test.mjs`  
Run: `npm run lint && npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit UI primitives**

```bash
git add components/marketplace/chat tests/commerce/chat-ui.test.mjs
git commit -m "feat: build accessible marketplace chat interface"
```

### Task 8: Add Role Inboxes and Contextual Marketplace Entry Points

**Files:**
- Create: customer, merchant, driver, and admin chat route files listed in File Structure.
- Modify: `components/marketplace/product-details.tsx`
- Modify: `components/marketplace/catalog-view.tsx`
- Modify: `components/commerce-operations/order-detail.tsx`
- Modify: `components/operations/MerchantOrderWorkspace.tsx`
- Modify: `components/operations/DriverWorkspace.tsx`
- Modify: `components/marketplace/role-shell.tsx`
- Create: `tests/commerce/chat-role-routes.test.mjs`

**Interfaces:**
- Consumes: `MarketplaceChatShell`, Task 3 service, Task 4 chat entry button.
- Produces role-specific route loaders with validated cursors and the same DTO contract.

- [ ] **Step 1: Write failing route/role tests**

Assert customer and role layouts require authentication, merchant and driver routes require their durable profile roles, admin routes call `requireAdminAal2({ capability: 'chat_monitor' })`, every dynamic ID is validated before RPC, and contextual links preserve safe return routes.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-role-routes.test.mjs`  
Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement route loaders and navigation**

Initial pages load inbox and selected conversation concurrently with `Promise.all`. Role shells add one inbox entry with unread badge. Existing support URLs redirect internally to the equivalent chat conversation after compatibility lookup; no existing record becomes unreachable.

```tsx
export default async function CustomerChatPage() {
  await requireAuthenticatedUser();
  const inbox = await listConversations({ role: 'customer', limit: 30 });
  return <MarketplaceChatShell initialInbox={inbox} initialConversation={null} role="customer" basePath="/account/chat" />;
}
```

- [ ] **Step 4: Add contextual chat actions**

Store/product actions open or reuse `presale`. Order actions open or reuse `order`. Driver actions appear only for an assigned active order. Anonymous actions call the Task 4 Google intent flow.

```tsx
<ChatEntryButton
  intent={{ kind: 'presale', storeId: product.storeId, productId: product.id }}
  returnTo={`/marketplace/products/${product.id}/${product.slug}`}
  label="اسأل المتجر"
/>
```

- [ ] **Step 5: Verify routes and legacy compatibility**

Run: `node --test tests/commerce/chat-role-routes.test.mjs tests/commerce/operations-ui.test.mjs tests/active-contact-boundary.test.mjs`  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit route integration**

```bash
git add app/account/chat app/merchant/marketplace/chat app/driver/marketplace/chat app/admin/marketplace/chat components/marketplace components/commerce-operations components/operations tests/commerce/chat-role-routes.test.mjs
git commit -m "feat: integrate chat across marketplace roles"
```

### Task 9: Add Private Image Attachments and Safe Card/Location Messages

**Files:**
- Create via CLI: the migration printed by `npx supabase migration new marketplace_chat_private_media`
- Create: `lib/commerce/chat/media.ts`
- Create: `app/api/marketplace/chat/attachments/route.ts`
- Modify: `components/marketplace/chat/message-composer.tsx`
- Modify: `components/marketplace/chat/message-card.tsx`
- Create: `tests/commerce/chat-media.test.mjs`

**Interfaces:**
- Produces: `beginChatAttachment(input)`, `completeChatAttachment(input)`, `signChatAttachmentRead(input)`, `deletePendingChatAttachment(input)`.
- Consumes: existing object-storage abstraction and participant RPC authorization.

- [ ] **Step 0: Create the private-media migration with the CLI**

Run: `npx supabase migration new marketplace_chat_private_media`  
Expected: one migration ending `_marketplace_chat_private_media.sql`. Define `marketplace_chat_attachments` with thread, owner, private bucket/key, SHA-256, MIME, byte size, dimensions, status, quarantine/deletion timestamps, and optional message ID; revoke direct client table access and expose caller-scoped initiate/complete/read/delete RPCs.

- [ ] **Step 1: Write failing media security tests**

Cover same-origin enforcement, authenticated user requirement, conversation membership, 8 MiB maximum, allowed MIME list, magic-byte validation, 4,096-pixel dimension cap, private bucket only, path format `chat/<thread>/<user>/<sha256>.<ext>`, short signed TTL, incomplete-upload cleanup, and no client-supplied bucket/key.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-media.test.mjs`  
Expected: FAIL because the media route is absent.

- [ ] **Step 3: Implement initiate and completion**

Initiate returns a signed PUT target for a server-generated key. Completion reads object metadata, decodes the raster with Sharp, validates magic bytes/dimensions, records the asset through RPC, and quarantines or deletes invalid data. Do not send public ACL headers.

```ts
const key = `chat/${input.conversationId}/${user.id}/${input.sha256}.${extension}`;
const metadata = await inspectPrivateRaster({ bucket: privateBucket, key, maximumBytes: 8 * 1024 * 1024 });
if (metadata.width > 4096 || metadata.height > 4096 || !allowedMime.has(metadata.mime)) {
  await quarantineChatObject({ bucket: privateBucket, key });
  throw new ChatMediaError('invalid_media');
}
return recordChatAttachment({ conversationId: input.conversationId, key, ...metadata });
```

- [ ] **Step 4: Add cards and consented location**

Product/store/order IDs are resolved server-side to safe snapshots. Location messages accept bounded latitude/longitude only for an active order and require an explicit confirmation UI; they never start background tracking.

```ts
const locationInput = z.object({
  type: z.literal('location'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
```

- [ ] **Step 5: Verify media and storage boundaries**

Run: `node --test tests/commerce/chat-media.test.mjs tests/commerce/media-contract.test.mjs tests/legacy-media-spaces.test.mjs`  
Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit media**

```bash
git add supabase/migrations lib/commerce/chat/media.ts app/api/marketplace/chat/attachments/route.ts components/marketplace/chat tests/commerce/chat-media.test.mjs
git commit -m "feat: add private marketplace chat media"
```

### Task 10: Add Monitoring, Risk Flags, Reports, and Audit

**Files:**
- Create via CLI: the migration printed by `npx supabase migration new marketplace_chat_monitoring_notifications`
- Create: `lib/commerce/chat/risk.ts`
- Create: `components/marketplace/chat/admin-monitor.tsx`
- Modify: admin chat routes from Task 8.
- Modify: `lib/auth/guards.ts`
- Create: `tests/commerce/chat-monitoring.test.mjs`

**Interfaces:**
- Produces RPCs: `list_marketplace_chat_monitor_queue`, `get_marketplace_chat_as_monitor`, `report_my_marketplace_chat_message`, `moderate_marketplace_chat`, `record_marketplace_chat_monitor_open`.
- Produces deterministic `classifyChatRisk(input): ChatRiskSignal[]` for safe server-side preprocessing; the database remains authoritative for persisted flags.

`ChatRiskSignal` is `{ type: 'external_contact' | 'off_platform_payment' | 'duplicate_outreach' | 'velocity' | 'reports' | 'denied_access'; score: 1 | 2 | 3; evidence: string[] }`. Evidence contains matched rule identifiers or counts, never full message bodies.

- [ ] **Step 1: Create the migration with the CLI**

Run: `npx supabase migration new marketplace_chat_monitoring_notifications`  
Expected: one migration ending `_marketplace_chat_monitoring_notifications.sql`.

- [ ] **Step 2: Write failing monitoring tests**

Test `chat_monitor` plus AAL2, no access for generic admins, audit-on-open once per admin session, search/export/moderation auditing, immutable original messages, report ownership, deterministic phone/external-link/off-platform-payment/duplicate/velocity signals, and no automatic suspension from a signal alone.

- [ ] **Step 3: Run and verify red**

Run: `node --test tests/commerce/chat-monitoring.test.mjs`  
Expected: FAIL because monitoring schema and UI are absent.

- [ ] **Step 4: Implement monitoring tables and RPCs**

Add bounded risk flags, reports, moderation actions, legal holds, and append-only audit rows. Monitoring DTOs may include message bodies, but application logs and analytics may not. `record_marketplace_chat_monitor_open` deduplicates `(admin_user_id, thread_id, monitor_session_id)`.

```sql
create unique index marketplace_chat_monitor_open_once
  on public.marketplace_chat_audit(actor_user_id, thread_id, monitor_session_id)
  where action = 'open';

revoke update, delete on public.marketplace_chat_audit from public, anon, authenticated;
```

- [ ] **Step 5: Build the administrator split view**

Filters cover role, store, order, driver, unread, report, risk, status, and time. Actions require a reason and support warn, pause, close, reopen, review, and dispute escalation. No component offers impersonation, silent editing, or audit deletion.

```tsx
<form action={moderateMarketplaceChatAction} className={styles.moderationForm}>
  <input type="hidden" name="conversationId" value={conversation.id} />
  <Label.Root htmlFor="moderation-reason">سبب الإجراء</Label.Root>
  <TextArea.Root id="moderation-reason" name="reason" minLength={5} maxLength={500} required />
  <Button.Root type="submit" name="action" value="pause">إيقاف المحادثة مؤقتًا</Button.Root>
</form>
```

- [ ] **Step 6: Verify monitoring and AAL2**

Run: `node --test tests/commerce/chat-monitoring.test.mjs tests/admin-mfa-security.test.mjs tests/commerce/admin-memberships.test.mjs`  
Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit monitoring**

```bash
git add supabase/migrations lib/commerce/chat/risk.ts lib/auth/guards.ts components/marketplace/chat app/admin/marketplace/chat tests/commerce/chat-monitoring.test.mjs
git commit -m "feat: add audited marketplace chat monitoring"
```

### Task 11: Extend Notifications and Add Resend Unread Email

**Files:**
- Extend: the Task 10 monitoring/notification migration.
- Create: `lib/commerce/chat/email-worker.ts`
- Create: `app/api/cron/chat-email/route.ts`
- Modify: `lib/env/server.ts`
- Modify: `scripts/check-env.mjs`
- Modify: `.env.example`
- Modify: `docs/staging-external-services.md`
- Modify: `components/marketplace/push-preferences.tsx`
- Modify: `app/account/notifications/page.tsx`
- Create: `tests/commerce/chat-email-worker.test.mjs`

**Interfaces:**
- Produces RPCs: `claim_marketplace_chat_email_jobs(integer, uuid)`, `complete_marketplace_chat_email_job(bigint, uuid, text)`, `fail_marketplace_chat_email_job(bigint, uuid, text)`.
- Produces: `processMarketplaceChatEmailJobs(limit: number): Promise<ChatEmailWorkerSummary>`.

`ChatEmailWorkerSummary` is `{ claimed: number; sent: number; retried: number; deadLettered: number }`. Internal helpers have exact signatures: `classifyResendError(error: unknown): ChatEmailFailureCode`, `completeClaim(job: ChatEmailJob, providerId: string): Promise<void>`, `failClaim(job: ChatEmailJob, code: ChatEmailFailureCode): Promise<void>`, and `renderUnreadChatEmail(input: { href: string; unreadCount: number }): string`.

- [ ] **Step 1: Write failing worker and environment tests**

```js
assert.match(worker, /import \{ Resend \} from 'resend'/);
assert.match(worker, /process\.env\.RESEND_API_KEY/);
assert.match(worker, /await resend\.emails\.send/);
assert.match(worker, /const \{ data, error \}/);
assert.match(worker, /idempotencyKey:/);
assert.doesNotMatch(worker, /onboarding@resend\.dev/);
assert.doesNotMatch(worker, /message\.body|signed_url|address/);
```

Test the five-minute unread delay, grouped messages, sender exclusion, quiet hours, opt-out, stable job key, 429 retry, provider-unavailable retry, invalid-recipient dead-letter, five-attempt ceiling, and message persistence when email fails.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-email-worker.test.mjs tests/environment-boundary.test.mjs`  
Expected: FAIL because Resend worker and environment keys are absent.

- [ ] **Step 3: Discover, install, and pin Resend**

Run in PowerShell: `$resendVersion = npm view resend version; npm install --save-exact "resend@$resendVersion"`  
Expected: `package.json` contains an exact numeric Resend version with no caret or tilde, and `package-lock.json` changes in the same commit. Run `npm audit --omit=dev --audit-level=high`; stop and select the newest non-vulnerable compatible exact version if the audit fails.

- [ ] **Step 4: Implement notification fan-out and email outbox**

New messages create in-app and Push notifications immediately and an email eligibility row at `created_at + interval '5 minutes'`. Claims skip messages already read, group by recipient/conversation, respect quiet hours/preferences, and use `FOR UPDATE SKIP LOCKED`.

```sql
insert into public.marketplace_chat_email_jobs(recipient_id, thread_id, event_key, available_at)
select participant.user_id, new.thread_id,
       'chat-email:' || new.thread_id::text || ':' || participant.user_id::text,
       new.created_at + interval '5 minutes'
  from public.marketplace_chat_participants as participant
 where participant.thread_id = new.thread_id
   and participant.removed_at is null
   and participant.user_id is distinct from new.sender_user_id
on conflict (event_key) do update
set available_at = excluded.available_at, updated_at = now();
```

Extend the existing notification-preferences surface with independent chat Push, chat email, and quiet-hour controls. Persist changes through an authenticated caller-scoped RPC; do not accept a recipient user ID from the client.

- [ ] **Step 5: Implement Resend delivery**

```ts
const resend = new Resend(requireServerEnv('RESEND_API_KEY'));
const { data, error } = await resend.emails.send({
  from: requireServerEnv('CHAT_EMAIL_FROM'),
  to: [job.recipientEmail],
  subject: 'لديك رسالة جديدة على ديرتك',
  html: renderUnreadChatEmail({ href: job.href, unreadCount: job.unreadCount }),
  idempotencyKey: job.eventKey,
});
if (error) return failClaim(job, classifyResendError(error));
return completeClaim(job, data.id);
```

Use only a verified-domain `CHAT_EMAIL_FROM` in deployed environments. CI injects a fake transport and never calls Resend.

The current Resend account has no domain. Do not create a domain, API key, or DNS record as part of this code task. Keep the worker disabled outside tests until Task 13 receives an action-time confirmation for those persistent external changes.

- [ ] **Step 6: Protect the cron route**

Use the existing timing-safe Bearer-secret pattern and bounded batch/concurrency. Document `RESEND_API_KEY` and `CHAT_EMAIL_FROM` as Preview/Staging keys before production configuration.

```ts
export async function POST(request: Request): Promise<Response> {
  if (!isTimingSafeBearer(request.headers.get('authorization'), requireServerEnv('CRON_SECRET'))) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await processMarketplaceChatEmailJobs(25));
}
```

- [ ] **Step 7: Verify notification delivery**

Run: `node --test tests/commerce/chat-email-worker.test.mjs tests/marketplace-notifications.test.mjs tests/environment-boundary.test.mjs`  
Run: `npm run typecheck && npm audit --omit=dev --audit-level=high`  
Expected: PASS.

- [ ] **Step 8: Commit email delivery**

```bash
git add package.json package-lock.json lib/commerce/chat/email-worker.ts app/api/cron/chat-email/route.ts lib/env/server.ts scripts/check-env.mjs .env.example docs/staging-external-services.md components/marketplace/push-preferences.tsx app/account/notifications/page.tsx supabase/migrations tests/commerce/chat-email-worker.test.mjs
git commit -m "feat: add unread marketplace chat email delivery"
```

### Task 12: Add Retention, Release Readiness, and Operational Recovery

**Files:**
- Extend: the Task 10 migration with bounded retention and scheduled invocation.
- Create via CLI: the migration printed by `npx supabase migration new marketplace_chat_release_marker`
- Modify: `app/api/health/ready/route.ts`
- Modify: `scripts/check-migrations.mjs`
- Create: `tests/commerce/chat-retention-release.test.mjs`

**Interfaces:**
- Produces RPCs: `run_marketplace_chat_maintenance(integer)`, `invoke_marketplace_chat_workers()`.
- Produces release capability `unified_marketplace_chat` in the exact release marker.

- [ ] **Step 1: Create the release-marker migration via CLI**

Run: `npx supabase migration new marketplace_chat_release_marker`  
Expected: one migration ending `_marketplace_chat_release_marker.sql`.

- [ ] **Step 2: Write failing retention/readiness tests**

Assert 365/90/730-day constants, legal-hold exclusion, bounded batches, retry-safe cursoring, private worker secrets read only from Vault, chat tables/functions/capability in release readiness, and generic health output that never exposes provider or database errors.

- [ ] **Step 3: Run and verify red**

Run: `node --test tests/commerce/chat-retention-release.test.mjs tests/health-boundary.test.mjs`  
Expected: FAIL because chat is not in release readiness.

- [ ] **Step 4: Implement bounded maintenance and release marker**

Redact at most 500 rows per maintenance invocation, skip legal holds, clear private attachment objects through the existing bounded cleanup worker, and retain tombstone/audit metadata as specified. The marker checks exact tables, indexes, RPC signatures, buckets, scheduled workers, and prior marketplace capabilities.

```sql
with expired as (
  select message.id
    from public.support_messages as message
    join public.support_threads as thread on thread.id = message.thread_id
   where thread.status = 'closed'
     and thread.resolved_at < now() - interval '365 days'
     and not exists (select 1 from public.marketplace_chat_legal_holds hold where hold.thread_id = thread.id and hold.released_at is null)
   order by message.id
   limit 500
   for update of message skip locked
)
update public.support_messages as message
   set body = '[redacted]', card_data = null, deleted_body = null
  from expired where message.id = expired.id;
```

- [ ] **Step 5: Verify migration parser and health boundary**

Run: `npm run check:migrations`  
Run: `node --test tests/commerce/chat-retention-release.test.mjs tests/health-boundary.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit retention and readiness**

```bash
git add supabase/migrations app/api/health/ready/route.ts scripts/check-migrations.mjs tests/commerce/chat-retention-release.test.mjs tests/health-boundary.test.mjs
git commit -m "feat: gate release on unified marketplace chat"
```

### Task 13: Complete End-to-End, Accessibility, Performance, and Security Verification

**Files:**
- Create: `e2e/marketplace-chat.spec.ts`
- Modify: `playwright.config.ts` only if an existing project cannot express the required fixture.
- Modify: `.github/workflows/verify.yml`
- Create: `tests/commerce/chat-performance-security.test.mjs`
- Modify: `docs/staging-external-services.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces repeatable Staging acceptance evidence and CI gates.

- [ ] **Step 1: Write E2E journeys before final wiring**

Create desktop and Pixel 7 cases for:

- anonymous store chat → Google gate → restored intent;
- anonymous cart → Google gate → restored checkout;
- customer/merchant pre-sale message and read state;
- order conversation with assigned driver;
- driver replacement and revoked access;
- offline send/retry/reconnect without duplicates;
- image upload failure/retry and private read;
- report → administrator monitor → warning/pause/reopen;
- message search, mute, report, sender deletion, and block-with-active-delivery escalation;
- keyboard-only composer, focus restoration, unread anchor, reduced motion, RTL, and axe.

```ts
test('anonymous chat resumes after Google authentication', async ({ page }) => {
  await page.goto('/marketplace');
  await page.getByRole('button', { name: 'اسأل المتجر' }).first().click();
  await expect(page).toHaveURL(/\/signin\?next=/u);
  await expect(page.getByRole('button', { name: /Google/u })).toBeVisible();
});
```

- [ ] **Step 2: Add static performance/security gates**

Assert bounded page limits, no full-history fetch, no message content in logs/analytics/Push/service worker/email HTML snapshots, no external contact links, no client `service_role`, no public attachment URL, and no admin monitoring route without AAL2 capability.

- [ ] **Step 3: Run the complete local gate**

Run: `npm run verify`  
Run: `npm run build`  
Expected: all unit/contract tests, ESLint, TypeScript, migration parser, environment contract, audit, and build pass.

- [ ] **Step 4: Rehearse every migration on Staging**

Run the repository's linked Staging migration workflow against `swsobooavcvmyejsuwlg`, then run `supabase test db`, generated-type drift, Supabase security advisors, performance advisors, and SQL checks for participant access, migration count, release marker, and worker schedules. Do not point runtime traffic at both projects.

- [ ] **Step 5: Configure only Staging/Preview credentials**

Configure Google OAuth, private Storage, Realtime, Push, `RESEND_API_KEY`, `CHAT_EMAIL_FROM`, and cron secrets in Preview/Staging. Never echo or commit secret values. Use a verified Resend domain; if none exists, keep email readiness closed and verify through the injected transport.

- [ ] **Step 6: Deploy Preview and run hosted verification**

Run Playwright/axe on desktop and mobile, Lighthouse budgets, exact-prefix storage smoke, Realtime reconnect tests, email-queue dry run, health endpoint, CodeQL, Dependency Review, and browser console inspection. Expected health is `200` only when every required Staging dependency is configured; otherwise the named missing dependency remains a deliberate gate.

- [ ] **Step 7: Commit final verification**

```bash
git add e2e/marketplace-chat.spec.ts playwright.config.ts .github/workflows/verify.yml tests/commerce/chat-performance-security.test.mjs docs/staging-external-services.md
git commit -m "test: verify unified marketplace chat end to end"
```

### Task 14: Prepare the Primary-Project Migration Runbook Without Applying It

**Files:**
- Create: `docs/production/unified-marketplace-chat-rollout.md`
- Create: `scripts/verify-primary-chat-readiness.mjs`
- Create: `tests/commerce/chat-rollout-runbook.test.mjs`

**Interfaces:**
- Consumes Staging evidence from Task 13.
- Produces a read-only readiness command and a production checklist with an explicit stop before mutation.

- [ ] **Step 1: Write failing runbook contract tests**

Assert the runbook names the primary and Staging refs correctly, prohibits dual writes, captures pre-migration counts, requires an additive migration diff, requires a recoverable database export/snapshot appropriate to the current Supabase plan, documents feature-flag disablement, and contains a bold explicit-confirmation checkpoint before any primary `db push` or provider change.

- [ ] **Step 2: Run and verify red**

Run: `node --test tests/commerce/chat-rollout-runbook.test.mjs`  
Expected: FAIL because the runbook and verifier do not exist.

- [ ] **Step 3: Implement the read-only verifier**

The script accepts `PRIMARY_SUPABASE_DB_URL` server-side, refuses the Staging hostname, and reports only counts/booleans: migration history, required tables, existing auth-user count, profile count, conflicting functions, release readiness, and advisor severity. It never prints connection strings, user rows, emails, tokens, or message bodies.

```js
const target = new URL(process.env.PRIMARY_SUPABASE_DB_URL);
if (target.hostname.includes('swsobooavcvmyejsuwlg')) throw new Error('staging_url_rejected');
const summary = await queryReadinessCounts(target);
process.stdout.write(`${JSON.stringify(summary)}\n`);
```

- [ ] **Step 4: Write the exact rollout and recovery sequence**

The runbook orders: freeze window, snapshot/export verification, read-only baseline, migration dry-run diff, explicit user confirmation, additive apply, count/constraint/RLS checks, feature flag off, internal monitor activation, role acceptance, gradual enablement, and feature-flag rollback. It states that destructive rollback is not the recovery strategy.

- [ ] **Step 5: Run the final local gate**

Run: `node --test tests/commerce/chat-rollout-runbook.test.mjs`  
Run: `npm run verify && npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit the production handoff**

```bash
git add docs/production/unified-marketplace-chat-rollout.md scripts/verify-primary-chat-readiness.mjs tests/commerce/chat-rollout-runbook.test.mjs
git commit -m "docs: prepare safe marketplace chat rollout"
```

- [ ] **Step 7: Stop at the production confirmation gate**

Present Staging evidence, the exact additive migration list, read-only primary counts, advisor results, environment changes, rollback switch, and estimated maintenance impact. Do not apply migrations to `gkpogxmyioleypzrceib`, change its Auth/Storage/Realtime settings, or enable the feature until the user explicitly confirms that exact production action.

## Plan Completion Gate

Before offering production activation, verify all of the following in one fresh run:

```bash
npm run verify
npm run build
npx supabase test db
npm run test:e2e:preview
```

Also require green CodeQL, Dependency Review, Preview Lighthouse, Preview Playwright/axe, storage smoke, Realtime reconnect, notification/email dry-run, Supabase security advisors, schema/type drift, and `/api/health/ready`. Keep the Draft PR open and Production unchanged until the explicit Task 14 confirmation.
