'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Ends the session on this device and returns to the home page as a signed-out visitor. */
export function SignOutButton({ className, iconClassName = 'size-4', label = 'تسجيل الخروج', onSignedOut }: {
  className?: string;
  iconClassName?: string;
  label?: string;
  onSignedOut?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const { error } = await createClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
      onSignedOut?.();
      // Refresh after navigating so no cached signed-in view survives.
      router.replace('/');
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={() => { void signOut(); }} disabled={pending} className={className}>
      <LogOut className={iconClassName} aria-hidden="true" />
      <span>{pending ? 'جارٍ الخروج…' : failed ? 'تعذر الخروج، حاول مرة أخرى' : label}</span>
    </button>
  );
}
