'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/auth/routes';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'إدارة المنصة',
  merchant: 'حساب محل',
  driver: 'حساب كابتن',
};

export function DashboardHeader({
  displayName,
  role,
}: {
  displayName: string;
  role: AppRole;
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const signOut = async () => {
    setIsSigningOut(true);
    setErrorMessage('');
    const { error } = await createClient().auth.signOut();
    if (error) {
      setErrorMessage('تعذر تسجيل الخروج. حاول مرة أخرى.');
      setIsSigningOut(false);
      return;
    }
    router.replace('/');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-xl">
      <div
        className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6"
        dir="rtl"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm">
            <Image
              src="/kayan-services-logo.png"
              alt="شعار خدمات الكيان"
              width={44}
              height={44}
              className="size-11 object-contain"
              priority
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-zinc-950">{displayName}</p>
            <p className="text-xs font-medium text-zinc-500">{ROLE_LABELS[role]}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
          >
            <Home className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">العودة لخدمات الكيان</span>
            <span className="sm:hidden">الخدمات</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-zinc-950 px-3 text-xs font-bold text-white transition-colors hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {isSigningOut ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
          </button>
        </div>
      </div>
      {errorMessage && (
        <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-700">
          {errorMessage}
        </p>
      )}
    </header>
  );
}
