# Staging external-services runbook

This runbook applies only to the `agent/marketplace-foundation` Vercel Preview
and Supabase project `dairtak-staging` (`swsobooavcvmyejsuwlg`). It must not be
used to edit the Production project, Production OAuth client, or Production
Vercel environment.

Never paste generated secrets into source files, pull-request comments, logs,
or chat. Store them directly in the provider dashboard and as sensitive Vercel
Preview variables scoped to the staging branch.

## Cloudflare R2

Use two Standard-storage buckets. R2 public access is bucket-wide and R2 does
not support the S3 `x-amz-acl` object header, so combining private staging files
and public product images in one public bucket is prohibited.

- Private bucket: `dairtak-staging-private`
- Public bucket: `dairtak-staging-public`
- Region: `auto`
- S3 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- Public base URL for staging: the public bucket's `r2.dev` URL

Enable public development access only on `dairtak-staging-public`. Keep
`dairtak-staging-private` private. The `r2.dev` endpoint is suitable for
staging; Production should use a reviewed custom domain.

Create one R2 Object Read & Write token restricted to exactly these two
buckets. Do not grant account administration or access to all buckets. Record
the Access Key ID and Secret Access Key at creation time; the secret cannot be
retrieved later.

Configure private-bucket CORS for direct uploads from the stable branch alias:

```json
[
  {
    "AllowedOrigins": [
      "https://kayan-git-agent-marketplace-foundation-amr55s-projects.vercel.app"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "cache-control",
      "content-type",
      "x-amz-meta-sha256"
    ],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add these sensitive branch-scoped Preview variables in Vercel:

```text
OBJECT_STORAGE_PROVIDER=cloudflare-r2
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
OBJECT_STORAGE_PRIVATE_BUCKET=dairtak-staging-private
OBJECT_STORAGE_PUBLIC_BUCKET=dairtak-staging-public
OBJECT_STORAGE_ACCESS_KEY_ID=<sensitive>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<sensitive>
OBJECT_STORAGE_PUBLIC_BASE_URL=https://<PUBLIC_BUCKET_ID>.r2.dev
```

The legacy `DO_SPACES_*` variables remain a temporary compatibility fallback.
Remove them from the staging branch after the R2 smoke test and readiness probe
pass. Do not delete the existing DigitalOcean bucket until its contents and any
retention requirement have been audited.

## Cloudflare Turnstile

Create a Free-plan Managed widget named `dairtak-staging`. Restrict it to the
stable Vercel branch hostname:

```text
kayan-git-agent-marketplace-foundation-amr55s-projects.vercel.app
```

Store the generated values as sensitive branch-scoped Preview variables:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>
TURNSTILE_SECRET_KEY=<secret key>
```

Use Cloudflare's published test keys for local automated tests; do not add a
Production hostname or reuse Production keys in staging.

## Google OAuth through Supabase Auth

Create a separate Google Web OAuth client named `DAIRTAK Staging`. Configure:

```text
Authorized JavaScript origin:
https://kayan-git-agent-marketplace-foundation-amr55s-projects.vercel.app

Authorized redirect URI:
https://swsobooavcvmyejsuwlg.supabase.co/auth/v1/callback
```

Enable Google only in the `dairtak-staging` Supabase Auth provider settings and
store the Google client ID and client secret there. In the same staging Auth URL
configuration, set the stable Preview alias as the Site URL and allow only the
application callback destinations required by the branch. Do not modify the
Production Google client or Supabase Auth settings.

## Verification and promotion gate

Run the gates in this order:

1. `npm run check:env` against a pulled branch-scoped Preview environment.
2. `npm run smoke:storage`; it writes and removes one object under a unique
   `ci-smoke/<run>/<uuid>/` prefix in the private bucket.
3. Upload and finalize one product image; verify its database locator uses the
   public bucket and its URL uses the configured public base.
4. Upload and view one delivery proof; verify its locator uses the private
   bucket and access requires an authorized signed route.
5. Complete one Turnstile-protected checkout and reject an invalid token.
6. Sign in with the staging Google client and verify the continuation remains
   on the stable Preview alias.
7. Confirm `/api/health/ready` returns HTTP 200 with database, schema, storage,
   and workers all `ok`.
8. Re-run `npm run verify`, Preview Playwright/axe, Lighthouse, CodeQL, and
   Dependency Review before any Production planning.

Sentry remains optional. Its absence must not fail environment preflight or the
readiness endpoint.
