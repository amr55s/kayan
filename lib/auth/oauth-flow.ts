import {
  inspectChatIntentCookie,
  signChatIntentCookie,
} from './chat-intent-cookie.ts';
import {
  parseChatLoginIntent,
  safeNextPath,
  type ChatLoginIntent,
} from './safe-next.ts';

type MaybePromise<T> = T | Promise<T>;

export type GoogleOAuthStartResult =
  | { success: true; url: string }
  | { success: false; code: 'oauth_in_progress' | 'start_failed'; message: string };

export function oauthInProgressFeedback() {
  return {
    code: 'oauth_in_progress' as const,
    message: 'هناك محاولة تسجيل دخول جارية في تبويب آخر. أكملها أو ألغها هناك، ثم أعد المحاولة هنا.',
  };
}

export async function startGoogleOAuthFlow(
  input: { next?: string | null; intent?: ChatLoginIntent | null },
  dependencies: {
    secret: string;
    siteUrl: string;
    now: () => number;
    randomFlowId: () => string;
    readCookie: () => MaybePromise<string | null | undefined>;
    writeCookie: (value: string) => MaybePromise<void>;
    deleteCookie: () => MaybePromise<void>;
    isAuthenticated: () => Promise<boolean>;
    startOAuth: (callbackUrl: string) => Promise<string>;
  },
): Promise<GoogleOAuthStartResult> {
  const next = safeNextPath(input.next);
  const intent = input.intent === null || input.intent === undefined
    ? null
    : parseChatLoginIntent(input.intent);
  if (input.intent && !intent) {
    return { success: false, code: 'start_failed', message: 'تعذر بدء تسجيل الدخول بجوجل. حاول مرة أخرى.' };
  }

  const current = inspectChatIntentCookie(await dependencies.readCookie(), {
    secret: dependencies.secret,
    now: dependencies.now(),
  });
  if (current.status === 'valid' && current.flow.phase !== 'cancelled') {
    return { success: false, ...oauthInProgressFeedback() };
  }

  if (await dependencies.isAuthenticated()) return { success: true, url: next };

  try {
    const site = new URL(dependencies.siteUrl);
    if (site.protocol !== 'https:' && site.hostname !== 'localhost') throw new Error('site_url_invalid');
    const flowId = dependencies.randomFlowId();
    const callback = new URL('/auth/callback', site.origin);
    callback.searchParams.set('flow', flowId);
    callback.searchParams.set('next', next);
    const oauthUrl = await dependencies.startOAuth(callback.toString());
    const parsedOauthUrl = new URL(oauthUrl);
    if (parsedOauthUrl.protocol !== 'https:' && parsedOauthUrl.hostname !== 'localhost') {
      throw new Error('oauth_url_invalid');
    }
    const signed = signChatIntentCookie({
      secret: dependencies.secret,
      flowId,
      returnTo: next,
      intent,
      phase: 'oauth',
      now: dependencies.now(),
    });
    await dependencies.writeCookie(signed.value);
    return { success: true, url: oauthUrl };
  } catch {
    return { success: false, code: 'start_failed', message: 'تعذر بدء تسجيل الدخول بجوجل. حاول مرة أخرى.' };
  }
}
