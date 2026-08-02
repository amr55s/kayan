'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Image as HeroImage,
  Tooltip,
} from '@heroui/react';
import {
  Check,
  Copy,
  CreditCard,
  Eye,
  Heart,
  Images,
  MessageCircle,
  Phone,
  ShoppingBag,
  Star,
} from 'lucide-react';
import type { Place } from '@/types';
import {
  formatPhoneForTel,
  formatWhatsAppUrl,
  getCategoryLabel,
} from '@/lib/utils';
import { SITE_NAME_AR } from '@/lib/brand';
import { ShareButton } from './ShareButton';
import { UpvoteButton } from './UpvoteButton';
import { useFavorites } from '@/hooks/useFavorites';
import { trackSiteEvent } from '@/lib/analytics/client';
import { CouponOffer } from './CouponOffer';

type PlaceCardProps = {
  detailsHref: string;
  onOpenDetails?: () => void;
  place: Place;
};

async function safeCopy(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function PlaceCard({
  detailsHref,
  onOpenDetails,
  place,
}: PlaceCardProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCash, setCopiedCash] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const images = Array.isArray(place.images)
    ? place.images.filter((image): image is string => Boolean(image))
    : [];

  async function copyWithStatus(
    value: string,
    setter: (copied: boolean) => void,
  ) {
    if (!(await safeCopy(value))) return;
    setter(true);
    window.setTimeout(() => setter(false), 2_000);
  }

  return (
    <Card
      shadow="none"
      className="soft-card group flex w-full max-w-full flex-col overflow-hidden p-0"
    >
      <CardHeader className="flex flex-col items-start gap-1.5 p-3 pb-2 sm:p-3.5 sm:pb-2">
        <div className="flex w-full items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-1">
            <Chip className="h-6 border border-zinc-200/60 bg-zinc-100 px-2 text-[11px] font-medium text-zinc-600">
              {getCategoryLabel(place.category)}
            </Chip>
            {place.is_featured && (
              <Chip className="h-6 border border-[#ffd6bb] bg-[var(--dairtak-orange-soft)] text-[10px] font-black text-[var(--dairtak-orange-deep)]">
                <Star className="me-1 size-3 fill-current" aria-hidden="true" />
                مميز
              </Chip>
            )}
          </div>

          <div className="flex shrink-0 items-center">
            <UpvoteButton
              placeId={place.id}
              initialCount={place.recommend_count || 0}
            />
            <ShareButton
              title={place.title}
              phone={place.phone}
              pageUrl={detailsHref}
              placeId={place.id}
            />
            <Tooltip
              content={isFavorite(place.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
              placement="top"
            >
              <Button
                isIconOnly
                variant="light"
                onClick={() => {
                  toggleFavorite(place.id);
                  trackSiteEvent('favorite_click', {
                    targetType: 'place',
                    targetKey: place.id,
                  });
                }}
                aria-label={isFavorite(place.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                className="size-11 min-w-11 bg-transparent p-0 hover:bg-zinc-100"
              >
                <Heart
                  aria-hidden="true"
                  className={`size-4 transition-[color,fill,transform] ${
                    isFavorite(place.id)
                      ? 'scale-110 fill-rose-500 text-rose-500 drop-shadow-[0_2px_5px_rgba(244,63,94,.28)]'
                      : 'text-zinc-400'
                  }`}
                />
              </Button>
            </Tooltip>
          </div>
        </div>

        <h2 className="min-w-0 text-base font-bold leading-snug sm:text-lg">
          <Link
            href={detailsHref}
            scroll={false}
            onClick={onOpenDetails}
            className="block break-words text-zinc-900 transition-colors hover:text-zinc-600 focus-visible:rounded-md"
          >
            {place.title}
          </Link>
        </h2>
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500"
          aria-label={`${place.view_count ?? 0} مشاهدة للمكان`}
        >
          <Eye className="size-3.5" aria-hidden="true" />
          {(place.view_count ?? 0).toLocaleString('ar-EG')} مشاهدة
        </span>
      </CardHeader>

      {images.length > 0 && (
        <div className="px-3 pb-1 sm:px-3.5">
          <Link
            href={detailsHref}
            scroll={false}
            onClick={onOpenDetails}
            aria-label={`عرض كل تفاصيل وصور ${place.title}`}
            className="group/image relative block aspect-[16/9] w-full overflow-hidden rounded-xl bg-zinc-100 text-white"
          >
            <HeroImage
              loading="lazy"
              src={images[0]}
              alt={`${place.title} — صورة المعاينة`}
              width={960}
              height={540}
              draggable={false}
              classNames={{
                wrapper: 'block h-full w-full',
                img: 'h-full w-full object-cover transition-transform duration-300 group-hover/image:scale-[1.02] motion-reduce:transition-none',
              }}
            />
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/0 transition-colors group-hover/image:bg-zinc-950/25">
              <span className="flex items-center gap-1 rounded-full bg-zinc-950/75 px-3 py-1.5 text-[11px] font-bold opacity-0 backdrop-blur-sm transition-opacity group-hover/image:opacity-100 group-focus-visible/image:opacity-100">
                <Eye className="size-3.5" aria-hidden="true" />
                عرض التفاصيل
              </span>
            </div>
            <span className="absolute bottom-2 start-2 z-20 flex items-center gap-1 rounded-full bg-zinc-950/75 px-2.5 py-1.5 text-[11px] font-bold backdrop-blur-sm">
              <Images className="size-3.5" aria-hidden="true" />
              {images.length} {images.length === 1 ? 'صورة' : 'صور'}
            </span>
          </Link>
        </div>
      )}

      <CardBody className="space-y-2 p-3 pt-2 sm:px-3.5">
        <CouponOffer place={place} />

        {place.description && (
          <div className={place.category === 'stores'
            ? 'rounded-xl border border-zinc-200 bg-zinc-50 p-2.5'
            : undefined}
          >
            {place.category === 'stores' && (
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-zinc-800">
                <ShoppingBag className="size-3.5" aria-hidden="true" />
                المنتجات وما يميز المتجر
              </span>
            )}
            <p className="line-clamp-1 break-words text-xs leading-relaxed text-zinc-600 sm:line-clamp-2">
              {place.description}
            </p>
          </div>
        )}

        {place.instapay_vfcash && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/60 bg-zinc-50 p-2 text-xs">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-zinc-800">
              <CreditCard className="size-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
              <span className="shrink-0">كاش / InstaPay</span>
              <bdi dir="ltr" className="truncate font-mono">
                {place.instapay_vfcash}
              </bdi>
            </div>
            <Button
              isIconOnly
              variant="flat"
              onClick={() => copyWithStatus(place.instapay_vfcash!, setCopiedCash)}
              aria-label="نسخ رقم الدفع"
              className="size-11 min-w-11 shrink-0 rounded-lg bg-zinc-200/70 text-zinc-700"
            >
              {copiedCash
                ? <Check className="size-3.5" aria-hidden="true" />
                : <Copy className="size-3.5" aria-hidden="true" />}
            </Button>
            <span aria-live="polite" className="sr-only">
              {copiedCash ? 'تم نسخ رقم الدفع' : ''}
            </span>
          </div>
        )}
      </CardBody>

      <CardFooter className="mt-auto flex gap-2 border-t border-zinc-100 bg-zinc-50/30 p-3 pt-2.5">
        <Button
          isIconOnly
          variant="flat"
          onClick={() => copyWithStatus(place.phone, setCopiedPhone)}
          aria-label="نسخ رقم الهاتف"
          className="size-11 min-w-11 rounded-xl bg-zinc-200/70 text-zinc-700"
        >
          {copiedPhone
            ? <Check className="size-4" aria-hidden="true" />
            : <Copy className="size-4" aria-hidden="true" />}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copiedPhone ? 'تم نسخ رقم الهاتف' : ''}
        </span>

        <Button
          as="a"
          href={formatWhatsAppUrl(
            place.whatsapp || place.phone,
            `مرحباً، استفسار عبر ${SITE_NAME_AR} عن: ${place.title}`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSiteEvent('whatsapp_click', {
            targetType: 'place',
            targetKey: place.id,
          })}
          startContent={<MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />}
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-100 px-2 text-xs font-bold text-zinc-900 hover:bg-zinc-200 sm:text-sm"
        >
          واتساب
        </Button>

        <Button
          as="a"
          href={`tel:${formatPhoneForTel(place.phone)}`}
          onClick={() => trackSiteEvent('phone_click', {
            targetType: 'place',
            targetKey: place.id,
          })}
          startContent={<Phone className="size-4 fill-current" aria-hidden="true" />}
          className="min-w-0 flex-1 rounded-xl bg-zinc-950 px-2 text-xs font-black text-white hover:bg-zinc-800 sm:text-sm"
        >
          اتصال
        </Button>
      </CardFooter>
    </Card>
  );
}
