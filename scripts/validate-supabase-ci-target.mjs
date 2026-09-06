const branchUrl = process.env.SUPABASE_CI_BRANCH_DB_URL?.trim();
const branchRef = process.env.SUPABASE_CI_BRANCH_REF?.trim();
const productionRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim();
const guard = process.env.SUPABASE_CI_BRANCH_GUARD?.trim();

if (!branchUrl || !branchRef || !productionRef) {
  throw new Error('Supabase CI branch URL, branch ref, and production ref are required.');
}
if (guard !== 'ALLOW_DISPOSABLE_BRANCH_MIGRATIONS') {
  throw new Error('Supabase CI branch mutation guard is missing.');
}
if (branchRef === productionRef) {
  throw new Error('Refusing to run hosted migration tests against the production project ref.');
}

const parsed = new URL(branchUrl);
if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
  throw new Error('SUPABASE_CI_BRANCH_DB_URL must be a PostgreSQL URL.');
}
const targetIdentity = `${parsed.hostname}:${decodeURIComponent(parsed.username)}`;
if (!targetIdentity.includes(branchRef)) {
  throw new Error('The disposable branch ref must appear in the database host or username.');
}
if (!/(?:supabase\.co|supabase\.com)$/u.test(parsed.hostname)) {
  throw new Error('The hosted migration contract accepts only Supabase database hosts.');
}

process.stdout.write('Validated a non-production disposable Supabase branch target.\n');
