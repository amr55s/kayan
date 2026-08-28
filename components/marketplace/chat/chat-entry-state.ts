import type { ChatErrorCode } from '../../../lib/commerce/chat/contracts.ts';
import { CHAT_RECOVERY_COPY } from '../../../lib/commerce/chat/copy.ts';

export type ChatRecoveryCode = ChatErrorCode | 'profile_setup';

const validRecoveryCodes = new Set<string>([
  'authentication_required',
  'rate_limited',
  'service_unavailable',
  'profile_setup',
]);

/**
 * Resolves the visual chat entry mode and user-facing recovery guidance based on authentication state.
 */
export function resolveChatEntryState(input: {
  isAuthenticated: boolean;
  recovery: ChatRecoveryCode | null;
}) {
  if (!input.isAuthenticated) return { mode: 'google' as const, message: null };
  if (input.recovery && validRecoveryCodes.has(input.recovery) && input.recovery in CHAT_RECOVERY_COPY) {
    return { mode: 'recovery' as const, message: CHAT_RECOVERY_COPY[input.recovery] };
  }
  return { mode: 'chat' as const, message: null };
}
