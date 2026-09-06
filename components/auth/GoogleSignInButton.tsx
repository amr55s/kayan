'use client';

import { useState, useTransition } from 'react';
import { Button } from '@heroui/react/button';
import { beginGoogleSignIn, switchToGoogleForOnboarding } from '@/lib/auth/oauth-actions';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';

export function GoogleSignInButton({
  next,
  intent,
  label = 'المتابعة باستخدام Google',
  helper,
  switchAccount = false,
}: {
  next?: string;
  intent?: ChatLoginIntent | null;
  label?: string;
  helper?: string;
  switchAccount?: boolean;
}) {
  const [feedback, setFeedback] = useState<{ code: string; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function signIn() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = switchAccount
          ? await switchToGoogleForOnboarding()
          : await beginGoogleSignIn({ next, intent });
        if (!result.success) {
          setFeedback({ code: result.code, message: result.message });
          return;
        }
        window.location.assign(result.url);
      } catch {
        setFeedback({ code: 'connection_failed', message: 'تعذر الاتصال بالخادم. أعد المحاولة؛ سلتك محفوظة.' });
      }
    });
  }

  return (
    <div className="space-y-3">
      <Button
        fullWidth
        size="lg"
        variant="primary"
        isPending={isPending}
        isDisabled={isPending}
        onPress={signIn}
        className="min-h-12 border border-zinc-950 bg-zinc-950 font-black text-white"
      >
        {isPending ? 'جارٍ فتح Google…' : label}
      </Button>
      {helper ? <p className="text-sm leading-6 text-zinc-600">{helper}</p> : null}
      {feedback ? (
        <p
          role="alert"
          className={feedback.code === 'oauth_in_progress'
            ? 'border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950'
            : 'border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-800'}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
