# Task 4 Report — Google-First Chat and Checkout Intent Recovery

## Status

Implemented from base `f3576809fede0e503b4a023492f173cf898d1bc2`.

- Commit message: `feat: preserve google-first chat and checkout intent`
- Final commit hash: recorded in the Task 4 handoff (this report is part of that commit).
- No Google Console, Supabase project, Vercel environment, live browser cookie,
  or other external-service state was changed.

## RED evidence

The initial executable `tests/commerce/chat-auth-intent.test.mjs` run failed 6/6
for the intended missing production behavior: there was no strict sanitizer API,
chat login href builder, signed intent cookie, flow binding, chat entry component,
or Google-first checkout/callback integration.

Two subsequent security cases were also observed RED on Node `v22.23.2` before
their production changes:

- a nested, double-encoded protocol-relative `next` value was retained instead
  of rejected;
- deployment preflight accepted a missing chat-intent signing secret.

## GREEN evidence

All authoritative final commands used Node `v22.23.2`.

- Required auth/checkout/intent command: 24 passed, 0 failed.
- Existing marketplace security, environment boundary, chat contracts, and chat
  service command: 25 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run check:env`: passed; the environment contract keeps the new secret
  server-only and requires at least 32 characters.
- Touched-file ESLint: passed with no output.
- `git diff --check`: passed; Git emitted only existing Windows line-ending
  conversion warnings.

Node's existing `MODULE_TYPELESS_PACKAGE_JSON` warning appeared in direct `.ts`
test imports and did not affect results.

## Implementation

- Added allowlisted, bounded internal return-path normalization that rejects
  absolute, protocol-relative, backslash, control-character, encoded, and nested
  redirect variants while retaining query strings for approved routes.
- Added exact UUID-validated `presale/storeId/productId` and `order/orderId`
  intent parsing plus `createChatLoginHref` without double-encoding the final
  destination.
- Added a 10-minute HMAC-SHA256 intent cookie with a constant-time signature
  comparison, flow UUID, exact return-path binding, HttpOnly, SameSite=Lax,
  production Secure, and one-time deletion after a successful OAuth callback.
- Bound callbacks to their initiating flow so cancellation can retry and a
  callback from another tab cannot consume the current tab's intent.
- Preserved callback sequencing: role-neutral customer setup, best-effort guest
  cart claim, intended conversation action, then exact return destination.
- Made Google the primary anonymous checkout and product-chat action. The new
  chat entry component consumes Task 3's action, exposes pending/error/retry
  states, stays internal, and uses sibling forms rather than nesting the chat
  action inside the purchase form.
- Kept checkout authenticated-only and introduced no service-role or anonymous
  checkout submission fallback.

## Files

- `.env.example`
- `app/auth/callback/route.ts`
- `app/marketplace/cart/claim/route.ts`
- `app/marketplace/products/[id]/[slug]/page.tsx`
- `app/signin/page.tsx`
- `components/auth/GoogleSignInButton.tsx`
- `components/marketplace/chat/chat-entry-button.tsx`
- `components/marketplace/checkout-form.tsx`
- `components/marketplace/product-details.tsx`
- `lib/auth/chat-intent-cookie.ts`
- `lib/auth/oauth-actions.ts`
- `lib/auth/safe-next.ts`
- `scripts/check-env.mjs`
- `tests/commerce/chat-auth-intent.test.mjs`
- `tests/environment-boundary.test.mjs`

## Security self-review

- Cookie payload parsing is strict at the envelope and intent levels; UUIDs,
  lifetime, signature, callback flow, and normalized return path are validated.
- The HMAC code is isolated from client components. Client boundaries receive
  only serializable intent/route values and import the intent type with
  `import type`.
- Mismatched cross-tab flows leave the other flow's cookie untouched. Missing,
  invalid, expired, or mismatched intent never opens a conversation.
- Google metadata is not used for role authorization. The existing customer RPC
  reads user metadata only for bounded display/avatar fields and uses server-owned
  app metadata for the provider; merchant, driver, and admin roles are unchanged.
- Cart claim remains before chat recovery, and checkout still derives the caller
  from the authenticated Supabase session without an admin client.

## Limitations / external follow-up

- A fresh server-only `MARKETPLACE_CHAT_INTENT_SECRET` of at least 32 characters
  must be configured in each deployment before this flow can start. The code and
  deployment preflight fail closed when it is absent or weak. It was deliberately
  not set in Vercel or any other external system in this task.
- Real Google cancellation, multi-tab OAuth, callback-cookie, and Supabase session
  behavior were not exercised in a live browser because external configuration
  and live browser state were explicitly out of scope. Local executable contract,
  crypto, action-boundary, type, and lint verification passed.
