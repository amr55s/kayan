'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, CardBody, Chip } from '@heroui/react';
import { Bike, MessageCircle, Phone, Share2 } from 'lucide-react';
import Link from 'next/link';
import type { Driver } from '@/types';
import { formatPhoneForTel, formatWhatsAppUrl } from '@/lib/utils';
import { shareDirectoryItem } from '@/lib/share';
import { trackSiteEvent } from '@/lib/analytics/client';

function availabilityLabel(activeUntil: string | null | undefined, now: number): string {
  if (!activeUntil) return 'خامل';
  const remainingMinutes = Math.ceil((new Date(activeUntil).getTime() - now) / 60_000);
  if (remainingMinutes <= 0) return 'خامل';
  if (remainingMinutes < 60) return `متاح ${remainingMinutes} دقيقة`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `متاح ${hours}س${minutes ? ` ${minutes}د` : ''}`;
}

export function DriverCard({
  driver,
  renderedAt,
  detailsHref,
  onOpenDetails,
}: {
  driver: Driver;
  renderedAt: number;
  detailsHref: string;
  onOpenDetails: () => void;
}) {
  const [now, setNow] = useState(renderedAt);

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  const isAvailable = useMemo(
    () =>
      driver.is_available &&
      Boolean(driver.active_until) &&
      new Date(driver.active_until as string).getTime() > now,
    [driver.active_until, driver.is_available, now],
  );
  const label = availabilityLabel(driver.active_until, now);
  const displayName = driver.name?.trim() || 'كابتن توصيل';

  const share = async () => {
    const url = new URL(detailsHref, window.location.origin).toString();
    const completed = await shareDirectoryItem(
      displayName,
      url,
      'كابتن توصيل داخل المنطقة — تواصل مباشر بدون وسيط',
    );
    if (completed) {
      trackSiteEvent('share_click', { targetType: 'driver', targetKey: driver.id });
    }
  };

  return (
    <Card className="w-full min-w-0 snap-start border border-zinc-700 bg-zinc-900 text-white shadow-none">
      <CardBody className="flex flex-col gap-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              name={displayName}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-sm font-bold text-white"
            />
            <div className="min-w-0">
              <Link
                href={detailsHref}
                onClick={onOpenDetails}
                className="block truncate text-sm font-extrabold hover:underline"
              >
                {displayName}
              </Link>
              <p className="dir-ltr mt-0.5 text-right font-mono text-xs text-zinc-300">
                <span className="font-sans text-zinc-400">للتواصل: </span>
                {driver.phone}
              </p>
              <p className="dir-ltr mt-0.5 text-right font-mono text-xs text-zinc-300">
                <span className="font-sans text-zinc-400">للواتس: </span>
                {driver.whatsapp || driver.phone}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
                <Bike className="size-3.5" aria-hidden="true" />
                {driver.vehicle_type || 'نوع المركبة غير محدد'}
              </p>
            </div>
          </div>
          <Chip
            className={`shrink-0 px-1.5 text-[10px] ${
              isAvailable
                ? 'border border-emerald-700/40 bg-emerald-500/10 text-emerald-300'
                : 'border border-zinc-700 bg-zinc-800 text-zinc-300'
            }`}
          >
            {isAvailable ? label : 'خامل'}
          </Chip>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={`مشاركة ${displayName}`}
            onPress={share}
            className="size-9 min-w-9 text-zinc-300"
          >
            <Share2 className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 pt-2.5">
          <Button
            as="a"
            href={formatWhatsAppUrl(
              driver.whatsapp || driver.phone,
              'السلام عليكم، محتاج توصيل طلب دليفري',
            )}
            target="_blank"
            rel="noopener noreferrer"
            onPress={() => trackSiteEvent('whatsapp_click', {
              targetType: 'driver',
              targetKey: driver.id,
            })}
            startContent={<MessageCircle className="size-4" aria-hidden="true" />}
            className="border border-zinc-700 bg-zinc-800 text-xs font-bold text-white"
          >
            واتساب
          </Button>
          <Button
            as="a"
            href={`tel:${formatPhoneForTel(driver.phone)}`}
            onPress={() => trackSiteEvent('phone_click', {
              targetType: 'driver',
              targetKey: driver.id,
            })}
            startContent={<Phone className="size-4" aria-hidden="true" />}
            className="bg-white text-xs font-extrabold text-zinc-950"
          >
            اتصال
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
