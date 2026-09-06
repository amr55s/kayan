'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { useOverlayState } from '@heroui/react';
import { Drawer } from '@heroui/react/drawer';
import { BookOpen, Home, LayoutDashboard, LogIn, Menu, MessageSquareText, Share2, ShoppingBag, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { beginGoogleSignIn } from '@/lib/auth/oauth-actions';
import { SITE_NAME, SITE_NAME_AR } from '@/lib/brand';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  isJoinOpen?: boolean;
  onJoinOpenChange?: (open: boolean) => void;
  onOpenAddModal?: () => void;
  onOpenDriverModal?: () => void;
  onOpenFeedbackModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenFeedbackModal,
}) => {
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);
  const menuState = useOverlayState();
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const joiningRef = useRef(false);

  const join = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setIsJoining(true);
    setJoinError('');
    try {
      const result = await beginGoogleSignIn('/onboarding');
      if (!result.success) {
        setJoinError(result.message);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setJoinError('تعذر الاتصال. حاول الانضمام مرة أخرى؛ لم نفقد بياناتك.');
    } finally {
      joiningRef.current = false;
      setIsJoining(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    async function loadDashboardPath() {
      const { data: userData } = await supabase.auth.getUser();
      if (mounted) setDashboardPath(userData.user ? '/onboarding' : null);
    }

    void loadDashboardPath().catch((error) => {
      console.warn('Dashboard link could not be loaded:', error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const chooseMenu = (action?: () => void) => {
    menuState.close();
    action?.();
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl">
        <nav
          aria-label="التنقل الرئيسي"
          className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between gap-1 overflow-hidden px-2 sm:px-5"
        >
        <div className="flex min-w-[8.75rem] shrink-0 items-center sm:min-w-[10rem]">
          <Link href="/" className="flex min-w-0 items-center" aria-label={`${SITE_NAME} - الصفحة الرئيسية`}>
            <BrandLogo
              variant="full"
              className="h-10 w-auto max-w-[8.75rem] sm:h-11 sm:max-w-[10rem]"
              priority
            />
          </Link>
        </div>

        <div className="hidden min-w-0 shrink items-center justify-end gap-0.5 md:flex md:shrink-0 md:gap-2">
          <div>
            <Link
              href="/marketplace"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--dairtak-orange-soft)] px-3 text-xs font-black text-[var(--dairtak-orange-deep)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-orange-100 motion-reduce:transform-none motion-reduce:transition-none"
            >
              <ShoppingBag className="size-4" aria-hidden="true" />
              المتجر
            </Link>
          </div>
          <div className="hidden md:block">
            <Link
              href="/guide"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
            >
              <BookOpen className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />
              طريقة الاستخدام
            </Link>
          </div>
          <div className="hidden md:block">
            <Link
              href="/share"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
            >
              <Share2 className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />
              شارك ديرتك
            </Link>
          </div>
          {onOpenFeedbackModal && (
            <div>
              <button
                type="button"
                onClick={onOpenFeedbackModal}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 sm:px-3"
              >
                <MessageSquareText className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">اقتراح أو تقييم</span>
                <span className="max-[359px]:sr-only sm:hidden">رأيك</span>
              </button>
            </div>
          )}
          <div>
            <Link
              href={dashboardPath ?? '/signin'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 sm:px-3"
            >
              {dashboardPath ? <LayoutDashboard className="size-4" aria-hidden="true" /> : <LogIn className="size-4" aria-hidden="true" />}
              <span className="max-[359px]:sr-only">
                {dashboardPath ? 'مساحات عملي' : 'دخول'}
              </span>
            </Link>
          </div>
          <div>
            <Button
              onPress={() => { void join(); }}
              isPending={isJoining}
              isDisabled={isJoining}
              className="min-h-11 bg-zinc-950 px-3 text-xs font-black text-white hover:bg-zinc-800 sm:px-4"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              <span className="sm:hidden">انضم</span>
              <span className="hidden sm:inline">انضم إلى {SITE_NAME_AR}</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 md:hidden">
          <Drawer state={menuState}>
            <Drawer.Trigger
              aria-label="فتح قائمة الموقع"
              className="inline-flex size-11 min-w-11 items-center justify-center rounded-xl border border-zinc-950 bg-zinc-950 text-white outline-none shadow-sm transition-[background-color,box-shadow,transform] hover:bg-zinc-800 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
            >
              <Menu className="size-5" aria-hidden="true" />
            </Drawer.Trigger>
            <Drawer.Backdrop variant="blur" className="z-[100] bg-zinc-950/45">
              <Drawer.Content
                placement="left"
                className="h-dvh w-full p-0 [direction:ltr]"
              >
                <Drawer.Dialog
                  aria-label="قائمة الموقع"
                  dir="rtl"
                  className="flex h-full w-full max-w-[22rem] flex-col rounded-none rounded-r-[28px] border-r border-zinc-200 bg-white shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-300 sm:max-w-[24rem]"
                >
          <Drawer.Header className="flex items-center justify-between border-b border-zinc-100 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo variant="full" className="h-11 w-auto max-w-[9.5rem] shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-zinc-500">كل خدمات ديرتك في مكان واحد</p>
              </div>
            </div>
            <Button
              isIconOnly
              variant="ghost"
              onPress={menuState.close}
              aria-label="إغلاق القائمة"
              className="size-11 min-w-11"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </Drawer.Header>
          <Drawer.Body className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <nav aria-label="روابط الموقع" className="space-y-1.5">
              <Link href="/" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl bg-zinc-950 px-4 text-sm font-black text-white">
                <Home className="size-5" aria-hidden="true" /> الصفحة الرئيسية
              </Link>
              <Link href="/marketplace" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl bg-[var(--dairtak-orange-soft)] px-4 text-sm font-black text-[var(--dairtak-orange-deep)] hover:bg-orange-100">
                <ShoppingBag className="size-5" aria-hidden="true" /> متجر ديرتك
              </Link>
              <Link href="/guide" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                <BookOpen className="size-5" aria-hidden="true" /> طريقة الاستخدام
              </Link>
              <Link href="/share" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                <Share2 className="size-5 text-[var(--dairtak-orange)]" aria-hidden="true" /> شارك ديرتك
              </Link>
              {onOpenFeedbackModal && (
                <button type="button" onClick={() => chooseMenu(onOpenFeedbackModal)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                  <MessageSquareText className="size-5" aria-hidden="true" /> اقتراح أو تقييم
                </button>
              )}
              <Link href={dashboardPath ?? '/signin'} onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                {dashboardPath ? <LayoutDashboard className="size-5" aria-hidden="true" /> : <LogIn className="size-5" aria-hidden="true" />}
                {dashboardPath ? 'مساحات عملي' : 'تسجيل الدخول'}
              </Link>
            </nav>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <UserPlus className="size-4" aria-hidden="true" />
                <h3 className="text-sm font-black">انضم إلى {SITE_NAME_AR}</h3>
              </div>
              <div className="space-y-2">
                <Button
                  onPress={() => { menuState.close(); void join(); }}
                  isPending={isJoining}
                  isDisabled={isJoining}
                  className="min-h-11 w-full justify-start bg-zinc-950 px-4 font-black text-white hover:bg-zinc-800"
                >
                  <UserPlus className="size-5" aria-hidden="true" />
                  {isJoining ? 'جارٍ المتابعة…' : 'انضم باستخدام Google'}
                </Button>
                <p className="px-1 text-xs leading-6 text-zinc-600">حساب واحد للشراء وأنشطتك. اختر ما تريد عمله بعد الدخول.</p>
              </div>
            </section>
          </Drawer.Body>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>
        </div>
        </nav>
      </header>

      {joinError ? (
        <div role="alert" className="mx-auto my-3 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{joinError}</p>
          <Button variant="ghost" onPress={() => { void join(); }} isDisabled={isJoining} className="mt-2 min-h-11">إعادة المحاولة</Button>
        </div>
      ) : null}
    </>
  );
};
