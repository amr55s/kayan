import type { ChatErrorCode } from '@/lib/commerce/chat/contracts';

const recoveryMessages: Partial<Record<ChatErrorCode, string>> = {
  authentication_required: 'انتهت جلسة الدخول. سجّل الدخول باستخدام Google ثم أعد المحاولة.',
  rate_limited: 'تعذر فتح المحادثة بعد تسجيل الدخول بسبب كثرة المحاولات. انتظر قليلًا ثم أعد المحاولة من هنا.',
  service_unavailable: 'تعذر فتح المحادثة بعد تسجيل الدخول. أعد المحاولة من هنا؛ لن نكرر تسجيل الدخول.',
};

export type ChatRecoveryCode = ChatErrorCode | 'profile_setup';

export function resolveChatEntryState(input: {
  isAuthenticated: boolean;
  recovery: ChatRecoveryCode | null;
}) {
  if (!input.isAuthenticated) return { mode: 'google' as const, message: null };
  if (input.recovery === 'profile_setup') {
    return {
      mode: 'recovery' as const,
      message: 'تم تسجيل الدخول، لكن تعذر تجهيز حساب المتجر. أعد المحاولة من هنا دون إعادة استخدام تسجيل Google.',
    };
  }
  if (input.recovery && recoveryMessages[input.recovery]) {
    return { mode: 'recovery' as const, message: recoveryMessages[input.recovery]! };
  }
  return { mode: 'chat' as const, message: null };
}
