# Kayan Hub

Kayan Hub now separates the public directory from authenticated delivery operations.

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
# kayan
