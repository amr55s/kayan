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
  const isConnected = (driver: Driver) =>
    driver.is_available
    && Boolean(driver.active_until)
    && new Date(driver.active_until as string).getTime() > renderedAt;
  const sortedDrivers = [...drivers].sort(
    (first, second) => Number(isConnected(second)) - Number(isConnected(first)),
  );
  const availableCount = sortedDrivers.filter(isConnected).length;
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
      sortedDrivers.length - 1,
      Math.max(0, Math.round(Math.abs(scroller.scrollLeft) / Math.max(step, 1))),
    );
    setActiveDriver(nextIndex);
  };

  return (
    <section className="overflow-hidden rounded-[22px] border border-zinc-900 bg-zinc-950 py-2.5 text-white shadow-[0_12px_36px_-28px_rgba(0,0,0,.9)] sm:rounded-[26px] sm:py-3.5">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white">
              <Bike className="size-4" aria-hidden="true" />
              <span className="absolute -bottom-0.5 -end-0.5 size-2 rounded-full border-2 border-zinc-950 bg-sky-300" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black text-white">توصيل سريع</h2>
                <Chip className="h-6 border border-white/15 bg-white/10 text-[10px] font-black text-white">
                  {availableCount} متصل
                </Chip>
              </div>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-400">المتصلون أولًا، وكل الكباتن ظاهرون.</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {isDriverAccount && (
              <Button
                onPress={renewPresence}
                isLoading={pending}
                startContent={!pending && <RefreshCw className="size-4" />}
                className="min-h-10 border border-white/15 bg-white px-3 text-xs font-bold text-zinc-950 hover:bg-zinc-100"
              >
                جدّد تواجدي
              </Button>
            )}
            {renewalMessage && (
              <span role="status" className="text-[10px] font-semibold text-zinc-300">
                {renewalMessage}
              </span>
            )}
          </div>
        </div>

        {sortedDrivers.length > 0 ? (
          <div
            className="no-scrollbar grid w-full auto-cols-[min(80vw,292px)] grid-flow-col snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-0.5 scroll-px-3 scroll-smooth overscroll-x-contain sm:auto-cols-[292px] sm:px-4 sm:scroll-px-4"
            aria-label="كل كباتن التوصيل في كيان سيتي سبوت"
            tabIndex={0}
            onScroll={updateActiveDriver}
          >
            {sortedDrivers.map((driver) => (
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
          <div className="mx-3 rounded-xl border border-dashed border-white/20 bg-white/5 px-3 py-2.5 text-xs font-semibold text-zinc-300 sm:mx-4">
            لا توجد بطاقات كباتن منشورة حاليًا.
          </div>
        )}

        {sortedDrivers.length > 1 && (
          <div className="flex items-center justify-center gap-2 px-3 text-[10px] font-semibold text-zinc-400 sm:hidden">
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            <span>اسحب لباقي الكباتن</span>
            <div className="flex items-center gap-1" aria-label={`${activeDriver + 1} من ${sortedDrivers.length}`}>
              {sortedDrivers.map((driver, index) => (
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
