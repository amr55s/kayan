# Google onboarding / shared identity — Preview handoff

## Scope and safety

- Integration branch: `agent/preproduction-integration`.
- The existing application, marketplace, chat and real-estate code remain one project.
- Database changes were applied only to `dairtak-staging` (`swsobooavcvmyejsuwlg`).
- No Production deployment, promotion, environment change or database change is included.
- Do not deploy a build made with the existing `.env.local`: it points to the old project and lacks a server secret. That file was preserved.
- `.env.preview-validation.local` is an ignored, local-only Preview configuration download. Never commit it or print its contents.
- Vercel downloads mask Sensitive variables: presence in that file is not evidence of a usable credential. The actual Staging server key was independently verified and synchronized to the scoped Preview; local verification injects it into the child process only, not the tracked source or the old `.env.local`.

## Implemented

- Direct Google public joining; separate legacy account login remains available. Explicit account switching does not link identities by email or phone.
- Same-origin, signed OAuth continuation for onboarding, basket and chat; Preview origins are constrained to platform deployment/branch hostnames.
- Five independent activity kinds and server-verified workspaces/memberships; selecting a workspace never grants permissions by itself.
- Owner-only versioned drafts, automatic save/retry, conflict handling and explicit recovery of interrupted edits.
- Activity-specific onboarding, optional first product draft, rejection/resubmission history and idempotent approval/materialization.
- Private draft images, ownership/hash validation, super-admin/MFA review of submitted media only, and leased post-approval directory publication.
- Shared main-site Header and visual tokens, HeroUI controls, responsive catalog sidebar/Drawer, reduced motion and workspace screens.
- Generated database types refreshed from Staging; RPC nullability adapters preserve SQL NULL semantics without weakening resource argument checks.

## Verification

- New Staging SQL suites: 27 foundation, 38 transition and 32 resource-authorization assertions passed. Tests run inside rolled-back transactions.
- SQL tests use `finish(true)` so the Management API cannot hide earlier TAP failures by returning only the last result set.
- All public application tables have RLS enabled. Advisors report no ERROR-level findings; intentional owner-checked SECURITY DEFINER RPCs and service-only tables remain documented warnings/information, not a claim of zero advisories.
- Application tests, type checking, lint, build and responsive browser results must be recorded against the final commit/Preview; a successful HTTP response alone is not an end-to-end pass.
- Dependency audit at the high-severity gate passes, but reports two moderate transitive `exceljs`/`uuid` findings. No breaking forced downgrade was applied.

## External blockers / explicit limits

1. Staging Auth settings currently report `external.google = false`. Enable the Google provider on **Staging** with the correct Google client configuration and verify its Supabase callback and Preview `/auth/callback` allowlist. The old project's enabled Google provider does not configure Staging.
2. Preview has no `DO_SPACES_SECRET_ACCESS_KEY`. Rotate the previously exposed credential and enter its replacement securely in Vercel, scoped to **Preview → agent/preproduction-integration**, with matching access ID and bucket configuration. Never paste the secret into a chat or commit it.
3. Real Google consent/callback, authenticated onboarding UI and real object upload/download still require verification after those settings are available. No claim of complete Production readiness is made.
4. The durable publication queue has an immediate post-approval attempt plus a daily maintenance fallback. Vercel Cron does not automatically run on Preview; use the protected maintenance workflow for a deliberate Staging test. Queue latency and worker failure monitoring still need operational acceptance before Production.
5. Database suspension and external public-object copying cannot be one atomic transaction. Suspension blocks directory finalization, but previously approved public object copies/caches are not instantly revoked.

Do not promote Preview until the real signed-in and storage flows pass and the health/storage gates are satisfied.
