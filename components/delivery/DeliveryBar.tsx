'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button, Chip } from '@heroui/react';
import { Bike, ChevronLeft, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Driver } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { renewDriverAvailability } from '@/lib/operations/actions';
import { DriverCard } from './DriverCard';

export function DeliveryBar({
  drivers,
  renderedAt,
  driverHref,
  onOpenDriverDetails,
}: {
  drivers: Driver[];
  renderedAt: number;
  driverHref: (driverId: string) => string;
  onOpenDriverDetails: () => void;
}) {
  const availableCount = drivers.filter((driver) => driver.is_available).length;
  const [activeDriver, setActiveDriver] = useState(0);
  const [isDriverAccount, setIsDriverAccount] = useState(false);
  const [renewalMessage, setRenewalMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    void supabase.auth.getUser()
      .then(async ({ data }) => {
        if (!data.user) return;
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, is_active, must_change_password')
          .eq('id', data.user.id)
          .maybeSingle();
        if (
          mounted
          && profile?.role === 'driver'
          && profile.is_active
          && !profile.must_change_password
        ) {
          setIsDriverAccount(true);
        }
      })
      .catch((error) => {
        console.warn('Driver account state could not be loaded:', error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function renewPresence() {
    setRenewalMessage('');
    startTransition(async () => {
      const result = await renewDriverAvailability();
      setRenewalMessage(
        result.success
          ? 'تم تجديد تواجدك لساعتين.'
          : result.message,
      );
      if (result.success) router.refresh();
    });
  }

  const updateActiveDriver = (event: React.UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    const firstCard = scroller.firstElementChild as HTMLElement | null;
    if (!firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(scroller).columnGap || '0');
    const step = firstCard.offsetWidth + gap;
    const nextIndex = Math.min(
      drivers.length - 1,
      Math.max(0, Math.round(Math.abs(scroller.scrollLeft) / Math.max(step, 1))),
    );
    setActiveDriver(nextIndex);
  };

  return (
    <section className="border-b border-zinc-800 bg-zinc-950 py-4 text-white">
      <div className="mx-auto max-w-7xl space-y-3">
        <div className="px-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-white">
              <Bike className="size-4.5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold sm:text-base">كباتن التوصيل</h2>
                <Chip className="border border-zinc-700 bg-zinc-900 text-[11px] text-zinc-200">
                  {availableCount} متاح الآن
                </Chip>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">تواصل مباشرة مع أقرب كابتن.</p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            {isDriverAccount && (
              <Button
                onPress={renewPresence}
                isLoading={pending}
                startContent={!pending && <RefreshCw className="size-4" />}
                className="self-start border border-zinc-700 bg-white px-3 text-xs font-bold text-zinc-950 sm:self-auto"
              >
                جدّد تواجدي لساعتين
              </Button>
            )}
            {renewalMessage && (
              <span role="status" className="text-[11px] font-semibold text-zinc-300">
                {renewalMessage}
              </span>
            )}
          </div>
        </div>
        </div>

        {drivers.length > 0 ? (
          <div
            className="no-scrollbar grid w-full auto-cols-[100%] grid-flow-col snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 scroll-px-3 scroll-smooth overscroll-x-contain sm:auto-cols-[calc((100%-1rem)/2)] sm:gap-4 sm:px-4 sm:scroll-px-4 lg:auto-cols-[calc((100%-2rem)/3)] xl:auto-cols-[calc((100%-3rem)/4)]"
            aria-label="كباتن التوصيل في كيان سيتي سبوت"
            tabIndex={0}
            onScroll={updateActiveDriver}
          >
            {drivers.map((driver) => (
              <DriverCard
                key={`${driver.source}:${driver.id}`}
                driver={driver}
                renderedAt={renderedAt}
                detailsHref={driverHref(driver.id)}
                onOpenDetails={onOpenDriverDetails}
              />
            ))}
          </div>
        ) : (
          <div className="mx-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-400 sm:mx-4">
            لا توجد بطاقات كباتن منشورة بعد. يمكن للكابتن التسجيل من زر «انضم» أعلى الصفحة.
          </div>
        )}

        {drivers.length > 1 && (
          <div className="flex items-center justify-center gap-2 px-3 text-[11px] text-zinc-400 sm:hidden">
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            <span>اسحب لعرض باقي الكباتن</span>
            <div className="flex items-center gap-1" aria-label={`${activeDriver + 1} من ${drivers.length}`}>
              {drivers.map((driver, index) => (
                <span
                  key={`${driver.source}:${driver.id}:dot`}
                  className={`h-1.5 rounded-full transition-[width,background-color] ${
                    index === activeDriver ? 'w-4 bg-white' : 'w-1.5 bg-zinc-700'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
