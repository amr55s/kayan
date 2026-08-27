import {
  inspectChatIntentCookie,
  transitionChatIntentCookie,
} from './chat-intent-cookie.ts';
import {
  createChatLoginHref,
  parseChatLoginIntent,
  safeNextPath,
  type ChatLoginIntent,
} from './safe-next.ts';
import type { ChatActionState } from '../commerce/chat/contracts.ts';

type MaybePromise<T> = T | Promise<T>;
type FlowDependencies = {
  siteUrl: string;
  secret: string;
  now: () => number;
  readCookie: () => MaybePromise<string | null | undefined>;
  writeCookie: (value: string) => MaybePromise<void>;
  deleteCookie: () => MaybePromise<void>;
  exchangeCode: (code: string) => Promise<void>;
  ensureCustomer: () => Promise<void>;
  claimGuestCart: () => Promise<void>;
  openConversation: (intent: ChatLoginIntent) => Promise<ChatActionState>;
};

const RECOVERY_CODES = new Set(['authentication_required', 'rate_limited', 'service_unavailable']);

function destination(siteUrl: string, path: string): URL {
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') throw new Error('site_url_invalid');
  return new URL(safeNextPath(path), site.origin);
}

function withMarker(siteUrl: string, path: string, name: 'error' | 'chat_recovery', value: string): string {
  const target = destination(siteUrl, path);
  target.searchParams.set(name, value.slice(0, 40));
  return target.toString();
}

function sameIntent(actual: ChatLoginIntent | null, expected: ChatLoginIntent): boolean {
  if (!actual || actual.kind !== expected.kind) return false;
  if (actual.kind === 'order' && expected.kind === 'order') return actual.orderId === expected.orderId;
  return actual.kind === 'presale'
    && expected.kind === 'presale'
    && actual.storeId === expected.storeId
    && actual.productId === expected.productId;
}

async function transitionExact(
  cookieValue: string | null | undefined,
  flowId: string,
  returnTo: string,
  phase: 'cancelled' | 'recovery',
  dependencies: FlowDependencies,
): Promise<boolean> {
  const transitioned = transitionChatIntentCookie(cookieValue, {
    secret: dependencies.secret,
    now: dependencies.now(),
    flowId,
    returnTo,
    phase,
  });
  if (transitioned.status !== 'valid') return false;
  await dependencies.writeCookie(transitioned.value);
  return true;
}

async function deleteExact(
  flowId: string,
  returnTo: string,
  dependencies: Pick<FlowDependencies, 'secret' | 'now' | 'readCookie' | 'deleteCookie'>,
): Promise<boolean> {
  const current = inspectChatIntentCookie(await dependencies.readCookie(), {
    secret: dependencies.secret,
    now: dependencies.now(),
  });
  if (
    current.status !== 'valid'
    || current.flow.flowId !== flowId
    || current.flow.returnTo !== returnTo
  ) return false;
  await dependencies.deleteCookie();
  return true;
}

function retryDestination(
  siteUrl: string,
  returnTo: string,
  intent: ChatLoginIntent | null,
  error: 'oauth_callback' | 'profile_setup',
): string {
  const retryPath = intent
    ? createChatLoginHref({ returnTo, intent })
    : `/signin?next=${encodeURIComponent(returnTo)}`;
  const retry = new URL(retryPath, new URL(siteUrl).origin);
  retry.searchParams.set('error', error);
  return retry.toString();
}

export async function handleGoogleOAuthCallback(
  input: { requestUrl: string },
  dependencies: FlowDependencies,
): Promise<{ redirectTo: string; event?: 'chat_open_failed' | 'callback_failed' }> {
  const site = new URL(dependencies.siteUrl);
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') throw new Error('site_url_invalid');
  const request = new URL(input.requestUrl);
  const returnTo = safeNextPath(request.searchParams.get('next'));
  const flowId = request.searchParams.get('flow');
  const cookieValue = await dependencies.readCookie();
  const inspected = inspectChatIntentCookie(cookieValue, {
    secret: dependencies.secret,
    now: dependencies.now(),
  });
  const pending = inspected.status === 'valid'
    && flowId === inspected.flow.flowId
    && returnTo === inspected.flow.returnTo
    ? inspected.flow
    : null;

  if (request.origin !== site.origin || !pending) {
    return { redirectTo: retryDestination(site.origin, returnTo, null, 'oauth_callback') };
  }

  // A browser retry of the callback must not exchange a second code or replay
  // an intent already waiting for explicit recovery.
  if (pending?.phase === 'recovery') {
    return { redirectTo: withMarker(site.origin, returnTo, 'chat_recovery', 'service_unavailable') };
  }
  if (pending.phase === 'cancelled') {
    return {
      redirectTo: retryDestination(site.origin, returnTo, pending.intent, 'oauth_callback'),
    };
  }
  if (!request.searchParams.get('code')) {
    await transitionExact(cookieValue, pending.flowId, returnTo, 'cancelled', dependencies);
    return {
      redirectTo: retryDestination(site.origin, returnTo, pending.intent, 'oauth_callback'),
    };
  }

  try {
    await dependencies.exchangeCode(request.searchParams.get('code')!);
    await dependencies.ensureCustomer();
    await dependencies.claimGuestCart().catch(() => undefined);

    if (!pending.intent) {
      await deleteExact(pending.flowId, returnTo, dependencies);
      return { redirectTo: destination(site.origin, returnTo).toString() };
    }
    const result = await dependencies.openConversation(pending.intent);
    if (result.status === 'sent') {
      await deleteExact(pending.flowId, returnTo, dependencies);
      return { redirectTo: destination(site.origin, returnTo).toString() };
    }
    if (result.status !== 'error') {
      await transitionExact(cookieValue, pending.flowId, returnTo, 'recovery', dependencies);
      return {
        redirectTo: withMarker(site.origin, returnTo, 'chat_recovery', 'service_unavailable'),
        event: 'chat_open_failed',
      };
    }
    if (RECOVERY_CODES.has(result.code)) {
      await transitionExact(cookieValue, pending.flowId, returnTo, 'recovery', dependencies);
      return {
        redirectTo: withMarker(site.origin, returnTo, 'chat_recovery', result.code),
        event: 'chat_open_failed',
      };
    }
    await deleteExact(pending.flowId, returnTo, dependencies);
    return {
      redirectTo: withMarker(site.origin, returnTo, 'chat_recovery', result.code),
      event: 'chat_open_failed',
    };
  } catch {
    return {
      redirectTo: retryDestination(site.origin, returnTo, pending?.intent ?? null, 'profile_setup'),
      event: 'callback_failed',
    };
  }
}

export async function retryRecoveredChatIntent(
  input: { intent: ChatLoginIntent; returnTo: string },
  dependencies: Pick<FlowDependencies,
    'secret' | 'now' | 'readCookie' | 'deleteCookie' | 'openConversation'>,
): Promise<ChatActionState> {
  const intent = parseChatLoginIntent(input.intent);
  const returnTo = safeNextPath(input.returnTo);
  if (!intent || returnTo !== input.returnTo) return { status: 'error', code: 'invalid_input' };
  const inspected = inspectChatIntentCookie(await dependencies.readCookie(), {
    secret: dependencies.secret,
    now: dependencies.now(),
  });
  if (
    inspected.status !== 'valid'
    || inspected.flow.phase !== 'recovery'
    || inspected.flow.returnTo !== returnTo
    || !sameIntent(inspected.flow.intent, intent)
  ) return dependencies.openConversation(intent);

  const result = await dependencies.openConversation(intent);
  if (result.status === 'sent') {
    await deleteExact(inspected.flow.flowId, returnTo, dependencies);
  }
  return result;
}
