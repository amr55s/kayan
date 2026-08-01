'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, CardBody, Chip } from '@heroui/react';
import { Bike, MessageCircle, Phone, Share2 } from 'lucide-react';
import Link from 'next/link';
import type { Driver } from '@/types';
import { formatPhoneForTel, formatWhatsAppUrl } from '@/lib/utils';
import { shareDirectoryItem } from '@/lib/share';
import { trackSiteEvent } from '@/lib/analytics/client';
import { driverAvatarTone } from '@/lib/driver-avatar';

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
    <Card className="w-full min-w-0 snap-start border border-zinc-200/90 bg-gradient-to-br from-white via-zinc-50 to-zinc-200/90 text-zinc-950 shadow-[0_7px_18px_-16px_rgba(0,0,0,.78)]">
      <CardBody className="flex flex-col gap-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              src={driver.avatar_url || undefined}
              name={displayName}
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black ${driverAvatarTone(driver.id)}`}
              classNames={{ img: 'object-cover' }}
            />
            <div className="min-w-0">
              <Link
                href={detailsHref}
                onClick={onOpenDetails}
                className="block truncate text-sm font-black hover:underline"
              >
                {displayName}
              </Link>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <Bike className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{driver.vehicle_type || 'مركبة غير محددة'}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {isAvailable && (
              <Chip className="h-6 border border-zinc-800 bg-zinc-950 px-2 text-[9px] font-black text-white">
                <span className="me-1 inline-block size-1.5 rounded-full bg-sky-300" aria-hidden="true" />
                متصل
              </Chip>
            )}
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={`مشاركة ${displayName}`}
              onPress={share}
              className="size-9 min-w-9 text-zinc-500"
            >
              <Share2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-200 pt-2">
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
            className="min-h-11 border border-zinc-200 bg-white/80 text-xs font-bold text-zinc-800 backdrop-blur-sm"
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
            className="min-h-11 bg-zinc-950 text-xs font-black text-white hover:bg-zinc-800"
          >
            اتصال
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
