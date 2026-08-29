'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { openMarketplaceConversationAction } from '@/lib/commerce/chat/actions';
import { retryMarketplaceConversationAction } from '@/lib/commerce/chat/recovery-action';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';
import type { ChatActionState } from '@/lib/commerce/chat/contracts';
import { CHAT_ERROR_COPY } from '@/lib/commerce/chat/copy';
import { resolveChatEntryState, type ChatRecoveryCode } from './chat-entry-state';
import styles from '../marketplace.module.css';

const initialState: ChatActionState = { status: 'idle' };

export function ChatEntryButton({
  intent,
  returnTo,
  loginHref,
  isAuthenticated,
  recovery = null,
  label = 'اسأل المتجر',
  chatRoute = '/account/chat',
}: {
  intent: ChatLoginIntent;
  returnTo: string;
  loginHref: string;
  isAuthenticated: boolean;
  recovery?: ChatRecoveryCode | null;
  label?: string;
  chatRoute?: '/account/chat' | '/merchant/marketplace/chat' | '/driver/marketplace/chat' | '/admin/marketplace/chat';
}) {
  const router = useRouter();
  const entry = resolveChatEntryState({ isAuthenticated, recovery });
  const [state, formAction, isPending] = useActionState(
    entry.mode === 'recovery'
      ? retryMarketplaceConversationAction
      : openMarketplaceConversationAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === 'sent') router.push(chatRoute);
  }, [chatRoute, router, state]);

  if (!isAuthenticated) {
    return (
      <div className="grid w-full gap-2" dir="rtl">
        <GoogleSignInButton
          next={returnTo}
          intent={intent}
          label="المتابعة باستخدام Google للتواصل"
          helper="سنفتح المحادثة ثم نرجعك إلى الصفحة نفسها. إذا أغلقت Google يمكنك إعادة المحاولة دون فقد وجهتك."
        />
        <Link href={loginHref} className={styles.secondaryButton}>
          فتح صفحة تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid w-full gap-2" dir="rtl">
      <input type="hidden" name="kind" value={intent.kind} />
      <input type="hidden" name="chatRoute" value={chatRoute} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {intent.kind === 'presale' ? (
        <>
          <input type="hidden" name="storeId" value={intent.storeId} />
          {intent.productId ? <input type="hidden" name="productId" value={intent.productId} /> : null}
        </>
      ) : (
        <input type="hidden" name="orderId" value={intent.orderId} />
      )}
      <button
        type="submit"
        disabled={isPending}
        aria-disabled={isPending}
        className={styles.secondaryButton}
      >
        {isPending ? 'جارٍ فتح المحادثة…' : entry.mode === 'recovery' ? 'إعادة محاولة فتح المحادثة' : label}
      </button>
      {entry.message ? (
        <p role="status" className="m-0 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950">
          {entry.message}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" className="m-0 text-sm font-bold leading-6 text-red-800">
          {CHAT_ERROR_COPY[state.code]}
        </p>
      ) : null}
      <p className="m-0 text-xs leading-5 text-zinc-600" aria-live="polite">
        {state.status === 'sent' ? 'تم فتح المحادثة. جارٍ نقلك إلى الرسائل…' : ''}
      </p>
    </form>
  );
}
