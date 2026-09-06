import 'server-only';
import { getSupabasePublicConfig } from '@/lib/env/server';

export type GoogleProviderAvailability = 'enabled' | 'disabled' | 'unavailable';

/** Check public Auth settings before creating a redirect or ending a legacy session. */
export async function checkGoogleProviderAvailability(): Promise<GoogleProviderAvailability> {
  try {
    const { url, publishableKey } = getSupabasePublicConfig();
    const response = await fetch(new URL('/auth/v1/settings', url), {
      headers: { apikey: publishableKey },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return 'unavailable';
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== 'object' || !('external' in settings)) return 'unavailable';
    const external = settings.external;
    if (!external || typeof external !== 'object' || !('google' in external)) return 'unavailable';
    return external.google === true ? 'enabled' : external.google === false ? 'disabled' : 'unavailable';
  } catch {
    // Network, timeout, redirect, configuration and malformed JSON all fail closed.
    return 'unavailable';
  }
}

export function googleProviderFeedback(availability: Exclude<GoogleProviderAvailability, 'enabled'>) {
  return {
    success: false as const,
    code: 'start_failed' as const,
    message: availability === 'disabled'
      ? 'تسجيل الدخول باستخدام Google غير مفعّل حاليًا. حاول لاحقًا أو تواصل مع الدعم.'
      : 'تعذر التحقق من إتاحة تسجيل الدخول باستخدام Google. تحقق من الاتصال وحاول مرة أخرى.',
  };
}
