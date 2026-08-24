'use client';

import { useState, useTransition } from 'react';
import { Button } from '@heroui/react/button';
import { beginGoogleSignIn } from '@/lib/auth/oauth-actions';

export function GoogleSignInButton({ next }: { next?: string }) {
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function signIn() {
    setMessage('');
    startTransition(async () => {
      const result = await beginGoogleSignIn(next);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      window.location.assign(result.url);
    });
  }

  return (
    <div className="space-y-3">
      <Button
        fullWidth
        size="lg"
        variant="primary"
        isPending={isPending}
        onPress={signIn}
        className="min-h-12 border border-zinc-950 bg-zinc-950 font-black text-white"
      >
        المتابعة باستخدام Google
      </Button>
      {message ? <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{message}</p> : null}
    </div>
  );
}
