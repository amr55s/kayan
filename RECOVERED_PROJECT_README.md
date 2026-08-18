# Recovered project: kayan

## Recovery source

This directory is a full Git clone of `https://github.com/amr55s/kayan.git`, checked out on the local branch `vercel-production-recovery` at commit `cda240aa54c77290ecdec416d403a929646511a5`. That commit is the one recorded by the latest successful Vercel Production deployment.

Vercel's official deployment-files API also returned 159 original source files from the same deployment. After normalizing Windows and Unix line endings, every file shared by Git and Vercel matched exactly. The recovery workspace preserves those files under `raw-vercel-artifacts/latest-production/src`; the public archive excludes the raw `.env.example` and `tsconfig.tsbuildinfo` cache, while retaining the sanitized `.env.example` in this project directory.

Estimated completeness: approximately 99–100% of the source used by the latest deployment. Files ignored by both Git and Vercel cannot be inferred or guaranteed.

## Requirements

- Node.js 22.x
- npm (the repository includes `package-lock.json`)
- Values for the variables listed in `.env.example`

## Install and run

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill .env.local locally. Do not commit it.
npm run dev
```

Open `http://localhost:3000`.

## Type-check, test, and build

```powershell
npx tsc --noEmit
npm test
npm run build
npm start
```

## Environment variable names

See `.env.example`. It contains names only and no values. Recoverable Vercel environment files are kept exclusively in the private backup archive.

## Known issues

- Vercel variables created with the `sensitive` type cannot be decrypted after creation. Any unavailable value must be regenerated or re-entered by the project owner.
- Local `npm audit` reported two high-severity dependency advisories. No automatic dependency changes were applied during recovery.
- The test runner emits a Node module-type performance warning for a few TypeScript imports; all 52 tests still pass.
- Fifty-one Lambda build-output entries could be listed but not downloaded from the deployment-file contents endpoint. Their original TypeScript sources were recovered successfully.

## Files created or modified during recovery

- Created `RECOVERED_PROJECT_README.md`.
- Replaced placeholder values in `.env.example` with empty values, leaving variable names only.
- Created local build output (`.next`) and installed dependencies (`node_modules`) for verification; both are excluded from the public archive.

No application source code, database migration, or business logic was invented or rewritten.
