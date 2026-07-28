# KAYAN CITY SPOT

KAYAN CITY SPOT separates the public directory from authenticated delivery operations.

## Required setup

1. Create a Supabase project and add the variables in `.env.example` to `.env`.
2. Apply `supabase/migrations/202607250001_secure_delivery_operations.sql` through the Supabase CLI or SQL editor **after a database backup**.
3. Enable Realtime publication for `delivery_orders` and `driver_profiles`.
4. If `pg_cron` is available, enable the commented `expire-kayan-delivery-offers` schedule in the migration.
5. Create the first administrator once:

   ```bash
   ADMIN_BOOTSTRAP_PHONE=01000000000 ADMIN_BOOTSTRAP_PASSWORD='a-long-unique-password' npm run bootstrap:admin
   ```

The administrator creates every merchant, branch, and driver account. Accounts are disabled until their `profiles.is_active` flag is enabled and drivers must renew availability every two hours.

## Delivery rules

- A merchant creates an offer for ten minutes, either public or for one selected available driver.
- `claim_delivery_order` locks the row, so one concurrent acceptance succeeds.
- A driver can release only an uncollected order. After pickup, a merchant/admin records an issue instead of silently reassigning it.
- Customer details are intentionally visible to vetted active drivers while an offer is live, then are removed from their feed after completion.

## Push delivery

`push_subscriptions` and `/api/push/subscribe` persist browser subscriptions. Run a trusted Supabase Edge Function or worker with `VAPID_PRIVATE_KEY` to drain `notification_outbox`; it must mark a row processed only after a successful send and use `event_key` for idempotency.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Place-details reliability rollout

Use the staged order below so existing users and uploads stay available:

1. Back up Supabase, then apply the additive reliability migration before
   promoting the post-deploy security migration:

   ```bash
   npx supabase db push --linked
   ```

   This adds optional place-detail fields, private aggregated diagnostics,
   upload throttling, and fixed function search paths without withdrawing the
   legacy access used by the currently deployed application.
2. Add `SUPABASE_SECRET_KEY` and `CLIENT_ERROR_HASH_SALT` to Vercel. Keep
   `SUPABASE_SERVICE_ROLE_KEY` temporarily as a compatibility fallback.
3. Merge through GitHub `main` and verify the Production deployment, image
   uploads, admin moderation, login refresh, and public driver list.
4. After Production passes its health checks, promote and apply
   `supabase/migrations/202607280002_revoke_legacy_privileges.sql`. This
   post-deploy migration removes public Storage listing/uploads and limits RPC
   execution to the intended roles. It is already promoted in this repository
   because the matching Production release was verified successfully.
5. Re-run the Supabase Security Advisor and monitor Vercel Web Analytics,
   Speed Insights, logs, and the aggregated admin error summary for 24–48
   hours.

Supabase leaked-password protection is intentionally documented as an
unresolved paid-plan advisor item. The application still enforces its existing
12-character minimum and does not force current users to rotate passwords.

Do not use `vercel --prod` for this project; GitHub `main` is the only
Production deployment source. Pull requests continue to create Preview
deployments.
# kayan
