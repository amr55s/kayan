import type { ChatErrorCode } from '@/lib/commerce/chat/contracts';

const recoveryMessages: Partial<Record<ChatErrorCode, string>> = {
  authentication_required: 'انتهت جلسة الدخول. سجّل الدخول باستخدام Google ثم أعد المحاولة.',
  rate_limited: 'تعذر فتح المحادثة بعد تسجيل الدخول بسبب كثرة المحاولات. انتظر قليلًا ثم أعد المحاولة من هنا.',
  service_unavailable: 'تعذر فتح المحادثة بعد تسجيل الدخول. أعد المحاولة من هنا؛ لن نكرر تسجيل الدخول.',
};

export function resolveChatEntryState(input: {
  isAuthenticated: boolean;
  recovery: ChatErrorCode | null;
}) {
  if (!input.isAuthenticated) return { mode: 'google' as const, message: null };
  if (input.recovery && recoveryMessages[input.recovery]) {
    return { mode: 'recovery' as const, message: recoveryMessages[input.recovery]! };
  }
  return { mode: 'chat' as const, message: null };
}
