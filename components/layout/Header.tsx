'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from '@heroui/react';
import { Bike, BookOpen, Building2, Home, LayoutDashboard, LogIn, Menu, MessageCircle, MessageSquareText, Share2, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { dashboardPathForRole, type AppRole } from '@/lib/auth/routes';
import { SITE_NAME, SITE_NAME_AR } from '@/lib/brand';
import { WHATSAPP_GROUP_URL } from '@/lib/community';
import { trackSiteEvent } from '@/lib/analytics/client';

interface HeaderProps {
  isJoinOpen: boolean;
  onJoinOpenChange: (open: boolean) => void;
  onOpenAddModal?: () => void;
  onOpenDriverModal?: () => void;
  onOpenFeedbackModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isJoinOpen,
  onJoinOpenChange,
  onOpenAddModal,
  onOpenDriverModal,
  onOpenFeedbackModal,
}) => {
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    async function loadDashboardPath() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role, is_active, must_change_password')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (mounted && profile?.is_active && !profile.must_change_password) {
        setDashboardPath(dashboardPathForRole(profile.role as AppRole));
      }
    }

    void loadDashboardPath().catch((error) => {
      console.warn('Dashboard link could not be loaded:', error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const choose = (action?: () => void) => {
    onJoinOpenChange(false);
    action?.();
  };

  const chooseMenu = (action?: () => void) => {
    setIsMenuOpen(false);
    action?.();
  };

  return (
    <>
      <Navbar
        isBordered
        maxWidth="full"
        className="sticky top-0 z-50 h-16 max-w-full gap-1 overflow-hidden border-b border-zinc-200/80 bg-white/90 px-2 backdrop-blur-xl sm:px-5"
      >
        <NavbarBrand className="w-11 min-w-11 shrink-0 sm:w-auto">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${SITE_NAME} - الصفحة الرئيسية`}>
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm">
              <Image
                src="/kayan-services-logo.png"
                alt={`شعار ${SITE_NAME}`}
                width={44}
                height={44}
                className="size-11 object-contain"
                priority
              />
            </span>
            <span className="hidden truncate text-[17px] font-black tracking-tight text-zinc-950 sm:block sm:text-lg">
              {SITE_NAME}
            </span>
          </Link>
        </NavbarBrand>

        <NavbarContent justify="end" className="hidden min-w-0 shrink gap-0.5 md:flex md:shrink-0 md:gap-2">
          <NavbarItem className="hidden md:block">
            <Link
              href="/guide"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
            >
              <BookOpen className="size-4" />
              طريقة الاستخدام
            </Link>
          </NavbarItem>
          <NavbarItem className="hidden md:block">
            <Link
              href="/share"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
            >
              <Share2 className="size-4" />
              شارك كيان
            </Link>
          </NavbarItem>
          <NavbarItem className="hidden lg:block">
            <a
              href={WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackSiteEvent('support_click', {
                targetType: 'feature',
                targetKey: 'header_whatsapp_group',
              })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              جروب واتساب
            </a>
          </NavbarItem>
          {onOpenFeedbackModal && (
            <NavbarItem>
              <button
                type="button"
                onClick={onOpenFeedbackModal}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 sm:px-3"
              >
                <MessageSquareText className="size-4" />
                <span className="hidden sm:inline">اقتراح أو تقييم</span>
                <span className="max-[359px]:sr-only sm:hidden">رأيك</span>
              </button>
            </NavbarItem>
          )}
          <NavbarItem>
            <Link
              href={dashboardPath ?? '/login'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 sm:px-3"
            >
              {dashboardPath ? <LayoutDashboard className="size-4" /> : <LogIn className="size-4" />}
              <span className="max-[359px]:sr-only">
                {dashboardPath ? 'لوحة التحكم' : 'دخول'}
              </span>
            </Link>
          </NavbarItem>
          <NavbarItem>
            <Button
              onClick={() => onJoinOpenChange(true)}
              startContent={<UserPlus className="size-4" />}
              className="bg-zinc-950 px-3 text-xs font-bold text-white hover:bg-zinc-800 sm:px-4"
            >
              <span className="sm:hidden">انضم</span>
              <span className="hidden sm:inline">انضم إلى {SITE_NAME_AR}</span>
            </Button>
          </NavbarItem>
        </NavbarContent>

        <NavbarContent justify="end" className="gap-2 md:hidden">
          <NavbarItem>
            <Button
              isIconOnly
              variant="flat"
              onPress={() => setIsMenuOpen(true)}
              aria-label="فتح قائمة الموقع"
              className="size-11 min-w-11 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-950"
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </NavbarItem>
        </NavbarContent>
      </Navbar>

      <Modal
        isOpen={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        aria-label="قائمة الموقع"
        classNames={{
          wrapper: '!items-stretch !p-0',
          base: 'me-auto !h-dvh !max-h-dvh !max-w-[22rem] rounded-none rounded-e-[28px] border-e border-zinc-200 bg-white',
          body: 'overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]',
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-between border-b border-zinc-100 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <Image src="/kayan-services-logo.png" alt="" width={40} height={40} />
              </span>
              <div>
                <h2 className="text-sm font-black text-zinc-950">{SITE_NAME}</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">كل خدمات كيان في مكان واحد</p>
              </div>
            </div>
            <Button
              isIconOnly
              variant="light"
              onPress={() => setIsMenuOpen(false)}
              aria-label="إغلاق القائمة"
              className="size-11 min-w-11"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </ModalHeader>
          <ModalBody className="space-y-5 pt-4">
            <nav aria-label="روابط الموقع" className="space-y-1.5">
              <Link href="/" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl bg-zinc-950 px-4 text-sm font-black text-white">
                <Home className="size-5" aria-hidden="true" /> الصفحة الرئيسية
              </Link>
              <Link href="/guide" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                <BookOpen className="size-5" aria-hidden="true" /> طريقة الاستخدام
              </Link>
              <Link href="/share" onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                <Share2 className="size-5" aria-hidden="true" /> شارك كيان
              </Link>
              <a
                href={WHATSAPP_GROUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  chooseMenu();
                  trackSiteEvent('support_click', { targetType: 'feature', targetKey: 'mobile_whatsapp_group' });
                }}
                className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
              >
                <MessageCircle className="size-5" aria-hidden="true" /> جروب واتساب
              </a>
              {onOpenFeedbackModal && (
                <button type="button" onClick={() => chooseMenu(onOpenFeedbackModal)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                  <MessageSquareText className="size-5" aria-hidden="true" /> اقتراح أو تقييم
                </button>
              )}
              <Link href={dashboardPath ?? '/login'} onClick={() => chooseMenu()} className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100">
                {dashboardPath ? <LayoutDashboard className="size-5" /> : <LogIn className="size-5" />}
                {dashboardPath ? 'لوحة التحكم' : 'تسجيل الدخول'}
              </Link>
            </nav>

            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <UserPlus className="size-4" aria-hidden="true" />
                <h3 className="text-sm font-black">انضم إلى {SITE_NAME_AR}</h3>
              </div>
              <div className="space-y-2">
                <Button
                  onPress={() => chooseMenu(onOpenDriverModal)}
                  startContent={<Bike className="size-5" />}
                  className="w-full justify-start border border-zinc-200 bg-white px-4 font-bold text-zinc-950"
                >
                  طلب حساب كابتن توصيل
                </Button>
                <Button
                  onPress={() => chooseMenu(onOpenAddModal)}
                  startContent={<Building2 className="size-5" />}
                  className="w-full justify-start bg-zinc-950 px-4 font-bold text-white"
                >
                  طلب حساب محل أو خدمة
                </Button>
              </div>
            </section>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={isJoinOpen} onOpenChange={onJoinOpenChange}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="border-b border-zinc-100">
                <div>
                  <h2 className="text-lg font-black text-zinc-950">انضم إلى {SITE_NAME_AR}</h2>
                  <p className="mt-1 text-sm font-normal text-zinc-500">اختر نوع التسجيل المناسب.</p>
                </div>
              </ModalHeader>
              <ModalBody className="space-y-2 py-4">
                <div className="grid grid-cols-2 gap-2 pb-2">
                  <Button
                    as={Link}
                    href="/guide"
                    onPress={() => choose()}
                    startContent={<BookOpen className="size-4" />}
                    className="border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-900"
                  >
                    طريقة الاستخدام
                  </Button>
                  <Button
                    as={Link}
                    href="/share"
                    onPress={() => choose()}
                    startContent={<Share2 className="size-4" />}
                    className="border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-900"
                  >
                    شارك كيان
                  </Button>
                </div>
                <Button
                  onClick={() => choose(onOpenDriverModal)}
                  startContent={<Bike className="size-5" />}
                  className="w-full justify-start border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-950 hover:bg-zinc-50"
                >
                  طلب حساب كابتن توصيل
                </Button>
                <Button
                  onClick={() => choose(onOpenAddModal)}
                  startContent={<Building2 className="size-5" />}
                  className="w-full justify-start bg-zinc-950 px-4 text-sm font-bold text-white hover:bg-zinc-800"
                >
                  طلب حساب محل أو خدمة
                </Button>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};
