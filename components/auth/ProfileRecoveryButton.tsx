'use client';

import { Button } from '@heroui/react/button';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { retryGoogleProfileRecoveryAction } from '@/lib/auth/profile-recovery-action';
import type { ChatActionState } from '@/lib/commerce/chat/contracts';

const initialState: ChatActionState = { status: 'idle' };

export function ProfileRecoveryButton({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(retryGoogleProfileRecoveryAction, initialState);

  useEffect(() => {
    if (state.status === 'sent') router.replace(returnTo);
  }, [returnTo, router, state]);

  return (
    <form action={action} className="space-y-3" dir="rtl">
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button.Root type="submit" fullWidth isDisabled={pending} className="min-h-12 bg-zinc-950 font-black text-white">
        {pending ? 'جارٍ تجهيز الحساب…' : 'إعادة محاولة تجهيز الحساب والسلة'}
      </Button.Root>
      {state.status === 'error' ? (
        <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-800">
          تعذر تجهيز الحساب الآن. لم نعد استخدام رمز Google؛ حاول مرة أخرى من هنا.
        </p>
      ) : null}
    </form>
  );
}
