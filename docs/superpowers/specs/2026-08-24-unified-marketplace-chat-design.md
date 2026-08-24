# DAIRTAK Unified Marketplace Chat Design

Date: 2026-08-24  
Status: Approved in conversation; awaiting written-spec review  
Scope: Marketplace customer, merchant, driver, and administrator messaging

## 1. Objective

Build a fast, mobile-first, Arabic/RTL chat experience inside the existing DAIRTAK product. Chat must be part of the marketplace, checkout, order, merchant, driver, and administration workflows rather than a separate application.

The system must:

- require Google authentication before checkout, order creation, opening a chat, or sending a message;
- support customer-to-merchant pre-sale conversations;
- support order-scoped customer, merchant, and assigned-driver conversations;
- give authorized administrators a clear monitoring dashboard for all conversations;
- deliver in-app and Web Push notifications immediately and delayed email notifications through Resend;
- preserve existing users and production data while evolving the existing support-message foundation;
- remain accessible, responsive, resilient to unreliable networks, and safe against cross-account access.

Calls, video, voice notes, arbitrary user-to-user messaging, and paid SMS delivery are outside the first release.

## 2. Environment and Source of Truth

The existing Supabase project `gkpogxmyioleypzrceib` is the sole production source of truth for Auth, Postgres, Storage, and Realtime. It currently contains the existing user base.

The Supabase project `swsobooavcvmyejsuwlg` remains an internal Staging and migration-rehearsal environment. It must not participate in production request handling, share runtime sessions, or act as a second user database. Validated additive migrations move from Staging to the primary project after explicit production approval.

Application code must never attempt cross-project joins, dual writes, or session synchronization between the two Supabase projects.

## 3. Architectural Approach

The implementation evolves the current `support_threads`, `support_messages`, and notification infrastructure into a unified conversation system. It does not introduce a parallel third-party chat product or duplicate support and chat tables.

Existing support RPCs and pages remain compatible during migration. New chat-specific APIs may wrap or supersede them incrementally, but existing support records remain readable.

### 3.1 Conversation types

- `presale`: a signed-in customer and a published store; may originate from a store or product page.
- `order`: the order customer, store members allowed to operate the order, and the currently assigned driver.
- `support`: a customer or merchant support conversation, optionally linked to a store or order.
- `dispute`: an order-linked conversation monitored or joined by an authorized administrator.

Only one active pre-sale conversation may exist for the same customer and store. Order conversation creation is idempotent per order.

### 3.2 Participants and access windows

A participant record represents a user, conversation role, join time, optional removal time, notification preferences, and read cursor.

- Customers may access their own conversations.
- Store access derives from active store membership and the required marketplace capability, not user-editable metadata.
- A driver gains access only when assigned to the linked active delivery.
- A replaced or unassigned driver loses access immediately.
- An authorized administrator with `chat_monitor` and AAL2 may inspect all conversations.
- System-authored events never grant participant access.

Membership and linked-order state are checked on every read, write, attachment-signing, and Realtime authorization path.

### 3.3 Messages

Messages support:

- plain text;
- private image attachments;
- safe product, store, order, and consented active-delivery location cards;
- reply-to references;
- a bounded set of reactions;
- system events;
- delivery and read state derived from durable cursors.

Each client send includes a caller-generated idempotency key unique within the conversation. The server returns the existing message when a retry repeats that key.

Messages are ordered by `(created_at, id)` and loaded through bounded keyset pagination. The client reconciles optimistic messages using the idempotency key rather than timestamps.

Sender deletion creates a visible tombstone. The original content remains available to authorized monitoring for 90 days and then follows the normal retention/redaction process. Users cannot edit another user's content, change sender identity, or mutate the linked order/store reference.

### 3.4 Realtime delivery

Writes remain authoritative Postgres RPC operations. Private Supabase Realtime channels provide delivery hints, new-message events, typing indicators, and Presence.

Realtime is not the only source of truth. On initial load, reconnect, tab focus, sequence gap, or subscription error, the client fetches a bounded page through the authenticated RPC and reconciles by message ID. Typing and Presence are ephemeral and never required for message correctness.

## 4. Authentication and Onboarding

Anonymous visitors may browse the marketplace and maintain a local cart. They may not create database orders, conversations, or messages.

Checkout and chat entry points use Google-first authentication:

1. Preserve a validated internal destination and the user's pending intent.
2. Start Supabase Google OAuth using PKCE.
3. Return only to an allowlisted internal path.
4. Create or reconcile a basic customer profile server-side using verified identity data.
5. Restore the local cart or intended store/product chat.
6. Collect only missing checkout data, such as phone and address.
7. Revalidate price, availability, stock, coupon, delivery, and totals on the server before order creation.

Google metadata may prefill display fields but never grants merchant, driver, administrator, or monitoring authorization. Merchants and drivers authenticate with Google before completing their role-specific application and approval workflow.

OAuth cancellation, expired sessions, cross-tab completion, and invalid return destinations have explicit recovery states that preserve the cart or intended destination where safe.

## 5. User Experience

Chat uses the existing DAIRTAK visual identity and shared navigation.

### 5.1 Entry points and routes

- customer inbox: `/account/chat`;
- merchant inbox: `/merchant/marketplace/chat`;
- driver inbox: `/driver/marketplace/chat`;
- monitoring dashboard: `/admin/marketplace/chat`.

Contextual chat actions appear on store, product, order, merchant-order, and driver-assignment surfaces. After authentication, the user returns directly to the intended context.

### 5.2 Responsive layout

Desktop uses a split inbox and active-conversation view. Mobile uses a full-screen conversation with a composer positioned above the keyboard and device safe area. Navigation preserves the previous list position and selected filters.

The header shows the participant/store identity, linked order when applicable, connection state, and a reliable back action. System events are visually distinct from user messages.

### 5.3 Composer and message states

The composer supports text, image preview/compression, cards, location consent, reply, and retry. It exposes clear pending, sent, delivered, read, failed, uploading, cancelled, and offline states.

The UI scrolls to the first unread message instead of always forcing the bottom. Loading older messages preserves scroll position. New-message indicators do not interrupt a user reading history.

### 5.4 Components and motion

HeroUI provides appropriate accessible primitives such as buttons, inputs, drawers, dropdowns, badges, avatars, tooltips, and skeletons. DAIRTAK-specific wrappers own domain behavior and styling so application code does not duplicate large generated component trees.

Motion is short and purposeful for navigation, send acknowledgement, retry, reaction, and state changes. All motion respects `prefers-reduced-motion`. Touch targets are at least 44 by 44 CSS pixels, focus is visible, status changes have restrained screen-reader announcements, and the interface supports RTL, keyboard operation, long Arabic text, zoom, and narrow mobile screens.

## 6. Administration and Risk Monitoring

Administrators with the `chat_monitor` capability and AAL2 can view all conversations from a dedicated dashboard. Generic administrator status alone is insufficient.

The dashboard supports filters for participant role, store, order, driver, unread state, report state, risk level, status, and time. It displays active conversations, reported conversations, suspicious conversations, and recent moderation actions.

The deterministic risk engine flags, but does not automatically punish, patterns including:

- attempts to move payment outside the platform;
- phone numbers or external-contact links;
- repeated identical outreach;
- abnormal message velocity;
- repeated reports;
- repeated denied access attempts.

Authorized staff may warn a participant, pause or close a conversation, reopen an eligible conversation, mark a risk review, or escalate a dispute. They cannot impersonate a participant, silently rewrite content, or erase the audit trail.

Opening a conversation is audited once per administrator session. Searches, exports, warnings, pauses, closes, and other moderation actions are individually audited with actor, capability, target, reason, timestamp, and request correlation ID.

## 7. Security and Abuse Controls

- Exposed tables use RLS as defense in depth.
- Client access uses narrowly scoped authenticated RPCs with explicit participant and order-state checks.
- `SECURITY DEFINER` routines are denied to `PUBLIC`, validate `auth.uid()`, set an empty search path, and receive only the grants they require.
- Authorization never trusts `user_metadata`.
- Private Realtime authorization mirrors durable participant access.
- Text is stored and rendered as plain text; raw user HTML is never rendered.
- Message, thread, search, upload, reaction, and report operations have independent rate limits and bounded payloads.
- A conversation and message count ceiling prevents unbounded abuse while archival pagination preserves normal use.
- Image objects use a conversation-scoped private prefix and short-lived signed access after authorization.
- Uploads validate extension-independent MIME, magic bytes, decoded dimensions, file size, and ownership; suspicious objects are quarantined.
- Location sharing requires explicit user action and an active delivery. It is not a background tracking feature.
- Logs and analytics exclude message bodies, credentials, signed URLs, exact addresses, and private attachment paths.

Users may report messages and mute notifications. Blocking cannot silently prevent completion of an active delivery; the system substitutes a constrained order-support channel and escalates to administration when necessary.

## 8. Notifications and Email

Every eligible new message creates an in-app notification and enqueues Web Push through the existing notification infrastructure. Notification fan-out is deduplicated by event key and excludes the sender.

If a recipient has not read the conversation after five minutes, an email job may be enqueued according to their preferences and quiet hours. Additional unread messages are grouped to avoid one email per message.

Resend integration requirements:

- use the `resend` package and `RESEND_API_KEY` server-side only;
- use a verified DAIRTAK sending domain in production;
- handle the SDK `{ data, error }` result explicitly;
- use a stable idempotency key based on the notification job;
- apply retry/backoff for network errors, provider errors, and HTTP 429 responses;
- keep the email subject and preview generic and link to the authenticated conversation rather than exposing sensitive content;
- never send real external email from CI.

SMS remains an inactive provider interface in the first release because it requires a paid provider. No code path claims SMS delivery while it is disabled.

## 9. Retention

- Closed conversation content is retained for 365 days, then redacted by a bounded maintenance job.
- Original content behind sender-deleted tombstones is retained for 90 days.
- Administrative access and moderation audit records are retained for 730 days.
- Retention durations are internal validated settings, not client-provided values.
- Legal or dispute holds may suspend redaction for a specific conversation through an audited administrator action.

## 10. Migration and Rollout

All database changes are additive until production acceptance. No existing production table or column is dropped or destructively renamed as part of the initial rollout.

1. Reconcile the 19-migration primary history with the 46-migration Staging history without rewriting applied history.
2. Rehearse the full additive path on Staging and a disposable local database seeded with representative, non-sensitive fixtures.
3. Add chat schema, policies, RPCs, indexes, retention routines, and compatibility wrappers behind a disabled feature flag.
4. Backfill existing primary profiles and support participants idempotently.
5. Verify counts, constraints, RLS, advisors, query plans, and compatibility functions.
6. Apply validated migrations to the primary project only after an explicit production change confirmation.
7. Enable monitoring for an internal administrator, then role-based test accounts.
8. Run end-to-end acceptance and readiness checks.
9. Enable the feature gradually. The feature flag can disable new chat entry points and sends without deleting data or stopping existing marketplace functionality.

Next.js framework upgrades are a separate change. The current project uses Next.js 16.2.12; chat implementation must not bundle an unrelated framework upgrade.

## 11. Failure Handling

- Offline sends remain a bounded local queue and require an authenticated session before server submission.
- Failed optimistic messages remain visible with safe retry or discard actions.
- Duplicate retries resolve to one durable message.
- Reconnect performs cursor-based catch-up and detects gaps.
- Assignment changes remove stale driver access before subsequent fetch, send, attachment, or subscription authorization.
- Cancelled orders, closed stores, closed conversations, disabled users, deleted accounts, upload failures, expired signed URLs, and rate limits have explicit user-facing states.
- Email and Push failures never roll back a successfully stored message; background jobs retry independently and dead-letter after bounded attempts.
- Public error responses use stable safe codes and never expose database, provider, or credential details.

## 12. Testing and Acceptance Criteria

### 12.1 Database and authorization

- RLS/RPC matrix for anonymous, customer, unrelated customer, merchant member, unrelated merchant, current driver, former driver, administrator without monitoring, and AAL2 monitoring administrator.
- Attempts to forge conversation, store, order, sender, participant, attachment, and role identifiers fail without disclosing record existence.
- Concurrent creation and repeated sends remain idempotent.
- Read cursors are monotonic and cannot be moved for another user.
- Retention and audit jobs are bounded, retry-safe, and preserve active disputes.

### 12.2 Realtime and notification delivery

- New messages, ordering, duplicate events, tab focus, reconnect, sequence gaps, Presence, typing expiry, and read state work across multiple devices.
- Push and email queues exclude senders, respect preferences and quiet hours, deduplicate jobs, group unread email, retry transient failures, and dead-letter permanent failures.
- Resend is mocked in CI and verified for import, server-only key use, awaited send, camelCase parameters, `{ data, error }` handling, verified production sender configuration, and idempotency.

### 12.3 User journeys

- Anonymous browse to cart to Google login to restored checkout.
- Anonymous chat intent to Google login to the intended store/product conversation.
- Customer-to-store pre-sale conversation.
- Customer, store, and assigned-driver order conversation.
- Driver replacement and access revocation.
- Reporting, monitoring, warning, pausing, closing, reopening, and dispute escalation.
- Image, card, reply, reaction, search, deletion tombstone, offline retry, and failed upload flows.

### 12.4 UI, accessibility, and performance

- Desktop and priority mobile viewport coverage through Playwright.
- axe checks, keyboard-only operation, focus restoration, live-region restraint, RTL, zoom, reduced motion, long text, and touch target verification.
- Initial conversation render does not load full history.
- Inbox and message pagination use bounded queries and stable cursors.
- Chat-specific JavaScript and image payloads remain within repository bundle and media budgets.
- Browser verification has no console errors or hydration warnings.

### 12.5 Release gate

Release readiness remains closed until the primary database schema, Google authentication, private Storage, Realtime authorization, workers, Push, email configuration, role journeys, security advisors, automated tests, and final health endpoint all pass. Production activation requires an explicit confirmation separate from approval of this design.

