export function resolveCheckoutEntryState(requiresAuthentication: boolean) {
  return { mode: requiresAuthentication ? 'google' as const : 'checkout' as const };
}
