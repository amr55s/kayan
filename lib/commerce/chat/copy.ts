import type { ChatErrorCode } from './contracts.ts';

/**
 * Standard Arabic UX copy for DAIRTAK unified marketplace chat.
 * Designed for calm, clear, and actionable Egyptian Arabic commerce communication.
 */

export const CHAT_ERROR_COPY: Record<ChatErrorCode, string> = {
  authentication_required: 'يرجى تسجيل الدخول أولًا للمتابعة.',
  invalid_input: 'البيانات المرسلة غير صحيحة، يرجى المحاولة مرة أخرى.',
  not_found: 'المحادثة أو الطلب المطلوب غير متاح حاليًا.',
  closed: 'هذه المحادثة مغلقة.',
  rate_limited: 'محاولات كثيرة في وقت قصير. يرجى الانتظار قليلًا والمحاولة مجددًا.',
  service_unavailable: 'تعذر الاتصال بالخدمة الآن. يرجى المحاولة بعد قليل.',
};

export const CHAT_RECOVERY_COPY: Record<ChatErrorCode | 'profile_setup', string> = {
  authentication_required: 'انتهت جلسة الدخول. سجّل الدخول للمتابعة.',
  rate_limited: 'تعذر فتح المحادثة بسبب كثرة المحاولات. انتظر قليلًا ثم أعد المحاولة من هنا.',
  service_unavailable: 'تعذر فتح المحادثة بعد تسجيل الدخول. أعد المحاولة من هنا؛ لن نكرر تسجيل الدخول.',
  profile_setup: 'تم تسجيل الدخول، لكن تعذر تجهيز حساب المتجر. أعد المحاولة من هنا دون إعادة تسجيل الدخول.',
  invalid_input: 'تعذر تحديد المحادثة المطلوبة بأمان.',
  not_found: 'لم يعد هذا المتجر أو الطلب متاحًا للمحادثة.',
  closed: 'هذه المحادثة مغلقة حاليًا.',
};

export const CHAT_STATUS_COPY = {
  sending: 'جارٍ الإرسال…',
  sent: 'تم الإرسال',
  delivered: 'تم التسليم',
  read: 'تمت القراءة',
  failed: 'تعذر الإرسال',
  retrying: 'جارٍ إعادة المحاولة…',
  deleted: 'تم حذف هذه الرسالة',
  uploading: 'جارٍ رفع الصورة…',
} as const;

export const CHAT_CONNECTION_COPY = {
  connected: 'متصل',
  connecting: 'جارٍ الاتصال…',
  reconnecting: 'جارٍ استعادة الاتصال…',
  offline: 'غير متصل بالإنترنت',
} as const;

export const CHAT_EMPTY_COPY = {
  inboxTitle: 'لا توجد محادثات حتى الآن',
  inboxDescription: 'عند بدء تواصل مع متجر أو طلب ستظهر محادثاتك هنا.',
  inboxAction: 'تصفح المتجر',
  conversationTitle: 'محادثة جديدة مع المتجر',
  conversationPrompt: 'اكتب استفسارك هنا وسيقوم المتجر بالرد عليك مباشرة.',
} as const;

/**
 * Returns localized Arabic user-facing copy for a given ChatErrorCode.
 */
export function getChatErrorMessage(code: ChatErrorCode | string | null | undefined): string {
  if (!code) return CHAT_ERROR_COPY.service_unavailable;
  return (CHAT_ERROR_COPY as Record<string, string>)[code] ?? CHAT_ERROR_COPY.service_unavailable;
}
