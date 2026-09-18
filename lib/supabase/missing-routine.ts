/** PostgREST/Postgres codes for a function that is not in the connected schema. */
export function isMissingDatabaseRoutine(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return code === 'PGRST202'
    || code === '42883'
    || /could not find the function/i.test(message);
}
