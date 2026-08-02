'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from '@heroui/react';
import {
  ArrowUpLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  Images,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  Send,
  Star,
  X,
} from 'lucide-react';
import type { Place } from '@/types';
import {
  formatPhoneForTel,
  formatWhatsAppUrl,
  getCategoryLabel,
} from '@/lib/utils';
import { SITE_NAME_AR } from '@/lib/brand';
import { trackSiteEvent, type SiteAnalyticsEvent } from '@/lib/analytics/client';
import { ShareButton } from './ShareButton';

type PlaceDetailsModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuggestDetails: (placeId: string) => void;
  place: Place | null;
};

function ImagePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-64 w-full flex-col items-center justify-center gap-2 bg-zinc-100 p-6 text-center text-zinc-500">
      <Images className="size-9" aria-hidden="true" />
      <p className="text-sm font-bold">لا توجد صورة متاحة لـ{title}</p>
    </div>
  );
}

function DetailLink({
  href,
  icon,
  label,
  tone = 'light',
  analyticsEvent,
  placeId,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone?: 'light' | 'dark' | 'green' | 'blue';
  analyticsEvent?: SiteAnalyticsEvent;
  placeId?: string;
}) {
  const tones = {
    light: 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100',
    dark: 'border-zinc-900 bg-zinc-950 text-white hover:bg-zinc-800',
    green: 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100',
    blue: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100',
  };
  return (
    <a
      href={href}
      target={href.startsWith('tel:') ? undefined : '_blank'}
      rel={href.startsWith('tel:') ? undefined : 'noopener noreferrer'}
      onClick={() => {
        if (analyticsEvent && placeId) {
          trackSiteEvent(analyticsEvent, { targetType: 'place', targetKey: placeId });
        }
      }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900 ${tones[tone]}`}
    >
      {icon}
      {label}
    </a>
  );
}

export function PlaceDetailsModal({
  isOpen,
  onOpenChange,
  onSuggestDetails,
  place,
}: PlaceDetailsModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [copiedPayment, setCopiedPayment] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const touchStartRef = useRef<number | null>(null);
  const trackedOpenRef = useRef(false);

  const images = useMemo(
    () =>
      (place?.images ?? []).filter(
        (image): image is string =>
          typeof image === 'string' && image.length > 0 && !brokenImages.has(image),
      ),
    [brokenImages, place?.images],
  );
  const activeIndex = Math.min(
    selectedIndex,
    Math.max(0, images.length - 1),
  );

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('place-details-open');
    return () => document.body.classList.remove('place-details-open');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !place || trackedOpenRef.current) return;
    trackedOpenRef.current = true;
    trackSiteEvent('place_open', { targetType: 'place', targetKey: place.id });
  }, [isOpen, place]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isGalleryOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIsGalleryOpen(false);
        return;
      }
      if (images.length < 2) return;
      const move = (delta: number) => {
        const next = (activeIndex + delta + images.length) % images.length;
        setSelectedIndex(next);
        imageRefs.current[next]?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      };
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(1);
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [activeIndex, images.length, isGalleryOpen, isOpen]);

  if (!place) return null;
  const paymentValue = place.instapay_vfcash;

  function markBroken(image: string) {
    setBrokenImages((current) => new Set(current).add(image));
  }

  function showImage(index: number) {
    if (!images.length) return;
    const next = (index + images.length) % images.length;
    setSelectedIndex(next);
    imageRefs.current[next]?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  function openGallery(index: number) {
    setSelectedIndex(index);
    setIsGalleryOpen(true);
  }

  function finishGallerySwipe(clientX: number) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start === null || Math.abs(clientX - start) < 45) return;
    showImage(activeIndex + (clientX < start ? 1 : -1));
  }

  function updateSelectedFromScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const center = scroller.getBoundingClientRect().left + scroller.clientWidth / 2;
    let closest = activeIndex;
    let distance = Number.POSITIVE_INFINITY;
    imageRefs.current.forEach((item, index) => {
      if (!item) return;
      const rect = item.getBoundingClientRect();
      const itemDistance = Math.abs(rect.left + rect.width / 2 - center);
      if (itemDistance < distance) {
        closest = index;
        distance = itemDistance;
      }
    });
    if (closest !== activeIndex) setSelectedIndex(closest);
  }

  async function copyPayment() {
    if (!paymentValue) return;
    try {
      await navigator.clipboard.writeText(paymentValue);
      setCopiedPayment(true);
      window.setTimeout(() => setCopiedPayment(false), 2_000);
    } catch {
      setCopiedPayment(false);
    }
  }

  const whatsappUrl = formatWhatsAppUrl(
    place.whatsapp || place.phone,
    `مرحباً، استفسار عبر ${SITE_NAME_AR} عن: ${place.title}`,
  );
  const hasCommunity = Boolean(place.whatsapp_group_url || place.telegram_url);
  const hasLocation = Boolean(place.address || place.map_url);
  const hasSecondaryActions = Boolean(
    place.whatsapp_group_url || place.telegram_url || place.map_url,
  );

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      aria-label={`تفاصيل ${place.title}`}
      classNames={{
        wrapper: 'p-1.5 sm:p-5',
        base: 'h-[calc(100dvh-.75rem)] max-h-none max-w-none rounded-[1.5rem] bg-white sm:h-[calc(100dvh-2.5rem)] sm:w-[min(1180px,calc(100vw-2.5rem))] sm:max-w-[1180px] sm:rounded-[1.75rem]',
        header: 'border-b border-zinc-200 bg-white/95 px-3 pb-2 pt-[max(.55rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-5 sm:py-3',
        body: 'overscroll-contain px-0 pb-0',
      }}
    >
      <ModalContent>
        {() => (
          <div data-place-details className="relative flex min-h-0 flex-1 flex-col">
            <ModalHeader className="relative flex min-w-0 items-center justify-between gap-2">
              <span
                aria-hidden="true"
                className="absolute start-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-300 sm:hidden"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-zinc-950 sm:text-base">
                  {place.title}
                </p>
                <p className="text-[11px] font-semibold text-zinc-500">
                  كل التفاصيل ووسائل التواصل
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ShareButton title={place.title} phone={place.phone} placeId={place.id} />
                  <Button
                    variant="light"
                    onPress={() => onOpenChange(false)}
                  aria-label="إغلاق تفاصيل المكان"
                  className="min-h-11 min-w-11 gap-1 rounded-xl bg-zinc-100 px-3 font-black text-zinc-900 hover:bg-zinc-200"
                >
                  <ChevronRight className="size-5 sm:hidden" aria-hidden="true" />
                  <X className="hidden size-4 sm:block" aria-hidden="true" />
                  <span className="text-xs sm:text-sm">
                    <span className="sm:hidden">رجوع</span>
                    <span className="hidden sm:inline">إغلاق</span>
                  </span>
                </Button>
              </div>
            </ModalHeader>

            <ModalBody>
              <div
                className={`mx-auto w-full max-w-6xl sm:pb-8 ${
                  hasSecondaryActions
                    ? 'pb-[calc(9rem+env(safe-area-inset-bottom))]'
                    : 'pb-[calc(6rem+env(safe-area-inset-bottom))]'
                }`}
              >
                <section aria-label="صور المكان" className="relative bg-zinc-950">
                  {images.length ? (
                    <>
                      <div
                        ref={scrollerRef}
                        onScroll={updateSelectedFromScroll}
                        className="no-scrollbar flex h-[42dvh] min-h-64 snap-x snap-mandatory overflow-x-auto overscroll-x-contain md:hidden"
                      >
                        {images.map((image, index) => (
                          <button
                            key={image}
                            ref={(element) => {
                              imageRefs.current[index] = element;
                            }}
                            type="button"
                            className="flex h-full min-w-full snap-center items-center justify-center bg-zinc-950"
                            onClick={() => openGallery(index)}
                            aria-label={`فتح الصورة ${index + 1} بالحجم الكامل`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image}
                              alt={`${place.title} — الصورة ${index + 1}`}
                              width={1600}
                              height={1200}
                              draggable={false}
                              onError={() => markBroken(image)}
                              className="h-full w-full select-none object-contain"
                            />
                          </button>
                        ))}
                      </div>

                      <div className="hidden h-[min(64vh,640px)] grid-cols-4 grid-rows-2 gap-1 bg-zinc-200 md:grid">
                        {images.slice(0, 5).map((image, index) => (
                          <button
                            key={image}
                            type="button"
                            onClick={() => openGallery(index)}
                            aria-label={`فتح الصورة ${index + 1} بالحجم الكامل`}
                            className={`relative flex items-center justify-center overflow-hidden bg-zinc-950 ${
                              index === 0 ? 'col-span-2 row-span-2' : ''
                            } ${images.length === 2 ? 'col-span-2 row-span-2' : ''}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image}
                              alt={`${place.title} — الصورة ${index + 1}`}
                              width={1600}
                              height={1200}
                              onError={() => markBroken(image)}
                              className="h-full w-full object-contain transition-transform duration-300 hover:scale-[1.02] motion-reduce:transition-none"
                            />
                            {index === 4 && images.length > 5 && (
                              <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/65 text-lg font-black text-white">
                                +{images.length - 5} صور
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {images.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => showImage(activeIndex - 1)}
                            aria-label="الصورة السابقة"
                            className="absolute start-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-lg md:hidden"
                          >
                            <ChevronRight className="size-5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => showImage(activeIndex + 1)}
                            aria-label="الصورة التالية"
                            className="absolute end-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-lg md:hidden"
                          >
                            <ChevronLeft className="size-5" aria-hidden="true" />
                          </button>
                        </>
                      )}

                      <div
                        aria-live="polite"
                        className="absolute bottom-3 start-3 z-10 flex items-center gap-2 rounded-full bg-zinc-950/75 px-3 py-1.5 text-xs font-black text-white backdrop-blur"
                      >
                        <Images className="size-4" aria-hidden="true" />
                        {activeIndex + 1} من {images.length}
                      </div>
                      <button
                        type="button"
                        onClick={() => openGallery(activeIndex)}
                        aria-label="عرض الصورة الحالية بالحجم الكامل"
                        className="absolute bottom-3 end-3 z-10 flex size-11 items-center justify-center rounded-full bg-zinc-950/75 text-white backdrop-blur focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <ImagePlaceholder title={place.title} />
                  )}
                </section>

                <div className="grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8 lg:py-8">
                  <div className="min-w-0 space-y-7">
                    <section>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip className="border border-zinc-200 bg-zinc-100 text-xs font-bold text-zinc-700">
                          {getCategoryLabel(place.category)}
                        </Chip>
                        {place.is_featured && (
                          <Chip className="border border-[#ffd6bb] bg-[var(--dairtak-orange-soft)] text-xs font-black text-[var(--dairtak-orange-deep)]">
                            <Star className="me-1 size-3.5 fill-current" aria-hidden="true" />
                            مكان مميز
                          </Chip>
                        )}
                      </div>
                      <h1 className="mt-3 break-words text-balance text-2xl font-black leading-tight text-zinc-950 sm:text-3xl">
                        {place.title}
                      </h1>
                      {place.category === 'stores' && (
                        <h2 className="mt-5 text-base font-black text-zinc-900 sm:text-lg">
                          المنتجات وما يميز المتجر
                        </h2>
                      )}
                      {place.description ? (
                        <p className="mt-4 whitespace-pre-wrap break-words text-pretty text-sm leading-8 text-zinc-600 sm:text-base">
                          {place.description}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-zinc-500">
                          تواصل مع المكان لمعرفة أحدث التفاصيل ومواعيد العمل.
                        </p>
                      )}
                    </section>

                    {hasCommunity && (
                      <section className="space-y-3 border-t border-zinc-200 pt-6">
                        <h2 className="flex items-center gap-2 text-lg font-black">
                          <MessagesSquare className="size-5" aria-hidden="true" />
                          الجروبات والقنوات
                        </h2>
                        <div className="flex flex-wrap gap-2">
                          {place.whatsapp_group_url && (
                            <DetailLink
                              href={place.whatsapp_group_url}
                              icon={<MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />}
                              label="انضم عبر WhatsApp"
                              tone="green"
                              analyticsEvent="group_click"
                              placeId={place.id}
                            />
                          )}
                          {place.telegram_url && (
                            <DetailLink
                              href={place.telegram_url}
                              icon={<Send className="size-4" aria-hidden="true" />}
                              label="افتح Telegram"
                              tone="blue"
                              analyticsEvent="telegram_click"
                              placeId={place.id}
                            />
                          )}
                        </div>
                      </section>
                    )}

                    {hasLocation && (
                      <section className="space-y-3 border-t border-zinc-200 pt-6">
                        <h2 className="flex items-center gap-2 text-lg font-black">
                          <MapPin className="size-5" aria-hidden="true" />
                          العنوان والموقع
                        </h2>
                        {place.address && (
                          <p className="break-words text-sm leading-7 text-zinc-600">
                            {place.address}
                          </p>
                        )}
                        {place.map_url && (
                          <DetailLink
                            href={place.map_url}
                            icon={<ArrowUpLeft className="size-4" aria-hidden="true" />}
                            label="فتح في تطبيق الخرائط"
                            analyticsEvent="map_click"
                            placeId={place.id}
                          />
                        )}
                      </section>
                    )}

                    <section className="border-t border-zinc-200 pt-6">
                      <button
                        type="button"
                        onClick={() => {
                          trackSiteEvent('feedback_open', {
                            targetType: 'feature',
                            targetKey: 'place_details_feedback',
                          });
                          onSuggestDetails(place.id);
                        }}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
                      >
                        <MessagesSquare className="size-4" aria-hidden="true" />
                        اقترح جروبًا أو عنوانًا أو تعديلًا
                      </button>
                    </section>

                    <div data-future-section="delivery-options" hidden />
                  </div>

                  <aside className="h-fit space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 lg:sticky lg:top-4">
                    <h2 className="text-base font-black">تواصل مباشرة</h2>
                    <div className="grid gap-2">
                      <DetailLink
                        href={`tel:${formatPhoneForTel(place.phone)}`}
                        icon={<Phone className="size-4 fill-current" aria-hidden="true" />}
                        label="اتصال"
                        tone="dark"
                        analyticsEvent="phone_click"
                        placeId={place.id}
                      />
                      <DetailLink
                        href={whatsappUrl}
                        icon={<MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />}
                        label="WhatsApp"
                        tone="green"
                        analyticsEvent="whatsapp_click"
                        placeId={place.id}
                      />
                    </div>
                    <p className="dir-ltr rounded-xl bg-white p-3 text-center font-mono text-sm font-bold text-zinc-800">
                      {place.phone}
                    </p>
                    {place.instapay_vfcash && (
                      <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <p className="flex items-center gap-2 text-xs font-bold text-zinc-600">
                          <CreditCard className="size-4" aria-hidden="true" />
                          Vodafone Cash / InstaPay
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <bdi dir="ltr" className="truncate font-mono text-sm font-black">
                            {place.instapay_vfcash}
                          </bdi>
                          <button
                            type="button"
                            onClick={copyPayment}
                            aria-label="نسخ رقم الدفع"
                            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                          >
                            <Copy className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        <span aria-live="polite" className="sr-only">
                          {copiedPayment ? 'تم نسخ رقم الدفع' : ''}
                        </span>
                      </div>
                    )}
                  </aside>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 rounded-b-[1.5rem] border-t border-zinc-200 bg-white/95 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:hidden">
                <DetailLink
                  href={whatsappUrl}
                  icon={<MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />}
                  label="WhatsApp"
                  tone="green"
                  analyticsEvent="whatsapp_click"
                  placeId={place.id}
                />
                <DetailLink
                  href={`tel:${formatPhoneForTel(place.phone)}`}
                  icon={<Phone className="size-4 fill-current" aria-hidden="true" />}
                  label="اتصال"
                  tone="dark"
                  analyticsEvent="phone_click"
                  placeId={place.id}
                />
                {(place.whatsapp_group_url || place.telegram_url || place.map_url) && (
                  <div className="col-span-2 flex gap-2 overflow-x-auto">
                    {place.whatsapp_group_url && (
                      <DetailLink
                        href={place.whatsapp_group_url}
                        icon={<MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />}
                        label="الجروب"
                        tone="green"
                        analyticsEvent="group_click"
                        placeId={place.id}
                      />
                    )}
                    {place.telegram_url && (
                      <DetailLink
                        href={place.telegram_url}
                        icon={<Send className="size-4" aria-hidden="true" />}
                        label="Telegram"
                        tone="blue"
                        analyticsEvent="telegram_click"
                        placeId={place.id}
                      />
                    )}
                    {place.map_url && (
                      <DetailLink
                        href={place.map_url}
                        icon={<MapPin className="size-4" aria-hidden="true" />}
                        label="الخريطة"
                        analyticsEvent="map_click"
                        placeId={place.id}
                      />
                    )}
                  </div>
                )}
              </div>
            </ModalBody>

            {isGalleryOpen && images.length > 0 && (
              <section
                aria-label={`عارض صور ${place.title}`}
                className="absolute inset-0 z-40 flex min-h-0 flex-col bg-zinc-950 text-white"
                onTouchStart={(event) => {
                  touchStartRef.current = event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const clientX = event.changedTouches[0]?.clientX;
                  if (typeof clientX === 'number') finishGallerySwipe(clientX);
                }}
              >
                <div className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-5">
                  <div aria-live="polite" className="flex items-center gap-2 text-sm font-black">
                    <Images className="size-4" aria-hidden="true" />
                    {activeIndex + 1} من {images.length}
                  </div>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setIsGalleryOpen(false)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black text-white hover:bg-white/20"
                  >
                    <X className="size-4" aria-hidden="true" />
                    إغلاق الصور
                  </button>
                </div>

                <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[activeIndex]}
                    alt={`${place.title} — الصورة ${activeIndex + 1} بالحجم الكامل`}
                    width={2000}
                    height={1500}
                    draggable={false}
                    onError={() => markBroken(images[activeIndex])}
                    className="max-h-full max-w-full select-none object-contain"
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => showImage(activeIndex - 1)}
                        aria-label="الصورة السابقة"
                        className="absolute start-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 sm:start-5"
                      >
                        <ChevronRight className="size-6" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => showImage(activeIndex + 1)}
                        aria-label="الصورة التالية"
                        className="absolute end-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 sm:end-5"
                      >
                        <ChevronLeft className="size-6" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
