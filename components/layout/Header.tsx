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
import { Bike, Building2, LayoutDashboard, LogIn, MessageSquareText, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { dashboardPathForRole, type AppRole } from '@/lib/auth/routes';
import { SITE_NAME, SITE_NAME_AR } from '@/lib/brand';

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

        <NavbarContent justify="end" className="min-w-0 shrink gap-0.5 sm:shrink-0 sm:gap-2">
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
      </Navbar>

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
