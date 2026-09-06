# Hosted CI contracts

`Quality gates / verify` remains the always-on required check. Hosted checks are
conditional because forked pull requests and fresh repository copies do not
receive infrastructure secrets. The `Hosted contract availability` summary says
`SKIPPED` when a contract cannot run; a missing secret must never be interpreted
as a successful hosted test.

## Supabase disposable branch

Configure these GitHub Actions secrets only for an isolated, disposable Supabase
branch database:

- `SUPABASE_CI_BRANCH_DB_URL`: encoded PostgreSQL URL for the disposable branch.
- `SUPABASE_CI_BRANCH_REF`: branch project ref; it must occur in the URL host or username.
- `SUPABASE_PRODUCTION_PROJECT_REF`: production ref; it must differ from the branch ref.
- `SUPABASE_CI_BRANCH_GUARD`: literal `ALLOW_DISPOSABLE_BRANCH_MIGRATIONS`.

The workflow refuses production-equivalent refs, applies every migration, runs
`supabase/tests/` with pgTAP, and diffs freshly generated TypeScript definitions
against `lib/supabase/database.types.ts`. Regenerate and review types after every
schema change; do not bypass the drift failure. Use a branch that can be reset or
recreated outside this workflow. The workflow never creates, merges, or deletes a
Supabase branch.

## Vercel Preview

Vercel Git integration emits `deployment_status`. Successful public Preview URLs
ending in `.vercel.app` run Chromium desktop/mobile Playwright checks, serious and
critical axe checks, and Lighthouse score budgets. Production deployments and
non-Vercel URLs are ignored. If Deployment Protection is enabled, configure a
purpose-built preview automation route or protection bypass in repository policy
before making these checks required; do not commit a bypass token.

The workflow tests the exact deployed commit and retains browser failure evidence
for seven days. It does not deploy, promote, alias, or roll back Vercel releases.

## S3-compatible object-storage smoke prefix

Configure `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_PRIVATE_BUCKET`,
`OBJECT_STORAGE_PUBLIC_BUCKET`, `OBJECT_STORAGE_REGION`,
`OBJECT_STORAGE_ACCESS_KEY_ID`, and `OBJECT_STORAGE_SECRET_ACCESS_KEY`. The
credentials must be limited to the two staging buckets. The legacy
`DO_SPACES_*` GitHub secrets remain supported while a Spaces environment is
migrated.

Each run writes one private object under `ci-smoke/<run>/<uuid>/`, verifies head/get/list,
and deletes only the exact key recorded by that process in a `finally` block. It
then verifies that its unique prefix is empty. No bucket-wide listing or wildcard
cleanup is performed.

## Dependency and branch-protection policy

Playwright and axe are exact-version dev dependencies in the lockfile. GitHub
Actions and the Supabase CLI are pinned in the workflow. Production dependency
audit remains `npm audit --omit=dev --audit-level=high`; Dependabot separately
tracks development tooling. Require the always-on quality and CodeQL checks.
Require hosted jobs only in repositories where their contracts are configured,
because GitHub treats a deliberately skipped conditional job differently from a
test that actually executed.
