'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { openMarketplaceConversationAction } from '@/lib/commerce/chat/actions';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';
import type { ChatActionState } from '@/lib/commerce/chat/contracts';
import styles from '../marketplace.module.css';

const initialState: ChatActionState = { status: 'idle' };
const errors = {
  authentication_required: 'انتهت جلسة الدخول. سجّل الدخول باستخدام Google ثم أعد المحاولة.',
  invalid_input: 'تعذر تحديد المحادثة المطلوبة بأمان.',
  not_found: 'لم يعد هذا المتجر أو الطلب متاحًا للمحادثة.',
  closed: 'هذه المحادثة مغلقة حاليًا.',
  rate_limited: 'أرسلت محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
  service_unavailable: 'تعذر فتح المحادثة الآن. أعد المحاولة بعد قليل.',
} as const;

export function ChatEntryButton({
  intent,
  returnTo,
  loginHref,
  isAuthenticated,
  label = 'اسأل المتجر',
}: {
  intent: ChatLoginIntent;
  returnTo: string;
  loginHref: string;
  isAuthenticated: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    openMarketplaceConversationAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === 'sent') router.push('/account/chat');
  }, [router, state]);

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
      <input type="hidden" name="chatRoute" value="/account/chat" />
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
        {isPending ? 'جارٍ فتح المحادثة…' : label}
      </button>
      {state.status === 'error' ? (
        <p role="alert" className="m-0 text-sm font-bold leading-6 text-red-800">
          {errors[state.code]}
        </p>
      ) : null}
      <p className="m-0 text-xs leading-5 text-zinc-600" aria-live="polite">
        {state.status === 'sent' ? 'تم فتح المحادثة. جارٍ نقلك إلى الرسائل…' : ''}
      </p>
    </form>
  );
}
