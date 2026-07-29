'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button, Chip } from '@heroui/react';
import { Check, Copy, Download, ImageOff, RotateCw, Share2 } from 'lucide-react';
import type { Driver, MarketingEntityType, MarketingTemplateKey, Place } from '@/types';
import {
  marketingIdeas,
  marketingText,
  marketingUrl,
} from '@/lib/marketing/content';
import { trackSiteEvent } from '@/lib/analytics/client';

const PUBLIC_REF = 'community-share';

type ShareItem = {
  key: string;
  entityType: MarketingEntityType;
  entityId: string | null;
  templateKey: MarketingTemplateKey;
  title: string;
  subtitle: string;
  place?: Pick<Place, 'id' | 'title' | 'category'>;
  driver?: Pick<Driver, 'id' | 'name' | 'vehicle_type'>;
};

function PublicShareCard({
  item,
  prioritizeImage = false,
}: {
  item: ShareItem;
  prioritizeImage?: boolean;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(prioritizeImage);
  const text = marketingText({
    templateKey: item.templateKey,
    campaignCode: PUBLIC_REF,
    place: item.place,
    driver: item.driver,
  });
  const targetKey = item.entityId || item.templateKey;
  const target = item.entityType === 'place' || item.entityType === 'driver'
    ? { targetType: item.entityType, targetKey } as const
    : { targetType: 'feature', targetKey: item.templateKey } as const;
  const cardParams = new URLSearchParams({
    type: item.entityType,
    template: item.templateKey,
    ref: PUBLIC_REF,
  });
  if (item.entityId) cardParams.set('id', item.entityId);
  const cardUrl = `/api/marketing-card?${cardParams.toString()}`;
  const previewParams = new URLSearchParams(cardParams);
  previewParams.set('preview', '1');
  const previewUrl = `/api/marketing-card?${previewParams.toString()}`;

  useEffect(() => {
    if (prioritizeImage || isNearViewport) return;
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isNearViewport, prioritizeImage]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, text });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      }
      trackSiteEvent('marketing_share_click', target);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <article
      ref={cardRef}
      className="min-w-0 overflow-hidden rounded-[28px] border border-zinc-200 bg-white [contain-intrinsic-size:auto_620px] [content-visibility:auto]"
    >
      {!isNearViewport ? (
        <div
          aria-hidden="true"
          className="aspect-square w-full animate-pulse bg-zinc-100 motion-reduce:animate-none"
        />
      ) : previewFailed ? (
        <div
          role="status"
          className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-zinc-100 p-6 text-center text-zinc-600"
        >
          <ImageOff className="size-8" aria-hidden="true" />
          <p className="text-sm font-bold">تعذر تحميل المعاينة مؤقتًا</p>
          <Button
            size="sm"
            variant="flat"
            onPress={() => setPreviewFailed(false)}
            startContent={<RotateCw className="size-4" aria-hidden="true" />}
            className="min-h-11 font-bold"
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <Image
          src={previewUrl}
          alt={`بطاقة مشاركة ${item.title}`}
          width={1080}
          height={1080}
          unoptimized
          loading="eager"
          fetchPriority={prioritizeImage ? 'high' : 'low'}
          decoding="async"
          sizes="(max-width: 639px) calc(100vw - 24px), (max-width: 1023px) 50vw, 33vw"
          onError={() => setPreviewFailed(true)}
          className="aspect-square w-full bg-zinc-100 object-cover"
        />
      )}
      <div className="space-y-4 p-4">
        <div>
          <Chip className="mb-2 bg-zinc-100 text-[11px] font-bold text-zinc-700">{item.subtitle}</Chip>
          <h2 className="line-clamp-2 font-black">{item.title}</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            onPress={copy}
            startContent={copied
              ? <Check className="size-4" aria-hidden="true" />
              : <Copy className="size-4" aria-hidden="true" />}
            className="min-h-11 min-w-0 bg-zinc-100 px-2 text-xs font-bold text-zinc-900"
          >
            {copied ? 'تم' : 'نسخ'}
          </Button>
          <Button
            onPress={share}
            startContent={<Share2 className="size-4" aria-hidden="true" />}
            className="min-h-11 min-w-0 bg-zinc-950 px-2 text-xs font-bold text-white"
          >
            مشاركة
          </Button>
          <a
            href={cardUrl}
            download={`kayan-${item.key}.png`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackSiteEvent('card_download', target)}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          >
            <Download className="size-4" aria-hidden="true" />
            تنزيل
          </a>
        </div>
      </div>
    </article>
  );
}

export function PublicShareHub({
  places,
  drivers,
}: {
  places: Array<Pick<Place, 'id' | 'title' | 'category'>>;
  drivers: Array<Pick<Driver, 'id' | 'name' | 'vehicle_type'>>;
}) {
  const placeItems: ShareItem[] = places.map((place) => ({
    key: `place-${place.id}`,
    entityType: 'place',
    entityId: place.id,
    templateKey: 'new_place',
    title: place.title,
    subtitle: 'مكان جديد',
    place,
  }));
  const driverItems: ShareItem[] = drivers.map((driver) => ({
    key: `driver-${driver.id}`,
    entityType: 'driver',
    entityId: driver.id,
    templateKey: 'new_driver',
    title: driver.name || 'كابتن توصيل',
    subtitle: 'كابتن توصيل',
    driver,
  }));
  const ideaItems: ShareItem[] = marketingIdeas
    .filter((idea) => ['general_site', 'merchant_invite', 'driver_invite', 'local_ambassadors'].includes(idea.key))
    .map((idea) => ({
      key: `idea-${idea.key}`,
      entityType: 'feature',
      entityId: null,
      templateKey: idea.key,
      title: idea.title,
      subtitle: 'محتوى جاهز',
    }));

  return (
    <div className="space-y-12">
      <section aria-labelledby="latest-places">
        <h2 id="latest-places" className="text-2xl font-black">أحدث الأماكن</h2>
        <p className="mt-2 text-sm text-zinc-600">شارك مكانًا مفيدًا مع جيرانك وساعد النشاط يوصل للناس.</p>
        {placeItems.length > 0 ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {placeItems.map((item, index) => (
              <PublicShareCard
                key={item.key}
                item={item}
                prioritizeImage={index === 0}
              />
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
            ستظهر بطاقات أحدث الأماكن هنا بعد اعتمادها.
          </p>
        )}
      </section>

      {driverItems.length > 0 && (
        <section aria-labelledby="latest-drivers">
          <h2 id="latest-drivers" className="text-2xl font-black">كباتن التوصيل</h2>
          <p className="mt-2 text-sm text-zinc-600">شارك بطاقة الكابتن؛ التوفر الظاهر يتحدث من الدليل نفسه.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {driverItems.map((item) => <PublicShareCard key={item.key} item={item} />)}
          </div>
        </section>
      )}

      <section aria-labelledby="help-grow">
        <h2 id="help-grow" className="text-2xl font-black">ساعد كيان يكبر</h2>
        <p className="mt-2 text-sm text-zinc-600">رسائل جاهزة لتعريف أصحاب المحلات والكباتن والسكان بالموقع.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ideaItems.map((item) => <PublicShareCard key={item.key} item={item} />)}
        </div>
      </section>
    </div>
  );
}
