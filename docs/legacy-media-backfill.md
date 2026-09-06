# Legacy media backfill runbook

This operator-only tool migrates existing `listing-images` place images and
`driver-avatars` profile images from Supabase Storage to DigitalOcean Spaces.
It is intentionally separate from the normal upload path.

## Safety contract

- The default command is a read-only dry run. It does not create a run or job
  rows and does not write to either object store.
- Apply mode requires both `--apply` and the literal
  `--confirm-apply=legacy-media-backfill` argument.
- The tool never deletes a Supabase Storage object. A successfully verified
  source enters a database retention hold for at least 30 days. Releasing that
  hold is a separate service-role operation and still does not delete it.
- DigitalOcean object keys contain only the media kind and the transformed
  SHA-256 digest. They never contain user, profile, merchant, or place IDs.
- Reports contain counts, status, an opaque run ID, and safe failure codes only.
  They do not contain URLs, object keys, entity IDs, credentials, or user data.

## Prerequisites

Apply migration `20260810081000_legacy_media_backfill.sql` on an approved
non-production branch first and validate RLS/RPC behavior there. Load these
existing server-only environment variables through the operator environment;
never paste their values into a report or command history:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `DO_SPACES_REGION`, `DO_SPACES_ENDPOINT`, and `DO_SPACES_BUCKET`
- `DO_SPACES_ACCESS_KEY_ID` and `DO_SPACES_SECRET_ACCESS_KEY`
- `DO_SPACES_CDN_BASE_URL`

## Commands

Run discovery only:

```powershell
npm run media:backfill:dry-run
```

Start an approved apply run with conservative defaults:

```powershell
npm run media:backfill:apply -- --confirm-apply=legacy-media-backfill
```

The command writes `.artifacts/legacy-media-backfill-report.json`. If its status
is `resume_required` or `failed`, resume the same ledger after addressing the
safe failure code:

```powershell
npm run media:backfill:apply -- --confirm-apply=legacy-media-backfill --run-id=<run-id>
```

Optional bounded controls are `--concurrency=1..4`, `--batch-size=1..25`, and
`--max-items=1..2000`. A non-final run exits with code 2 so automation cannot
mistake a checkpoint for completion. `completed_with_errors` also exits with
code 2 and requires review of dead-letter counts before any follow-up action.
