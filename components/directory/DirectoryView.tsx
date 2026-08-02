'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, Button, Skeleton, Card } from '@heroui/react';
import { BadgePercent, Search, MapPinOff, RefreshCw, Heart, MessageCircle } from 'lucide-react';
import { Place, Driver, CategoryType } from '@/types';
import { Header } from '@/components/layout/Header';
import { DeliveryBar } from '@/components/delivery/DeliveryBar';
import { CategoryTabs } from './CategoryTabs';
import { PlaceCard } from './PlaceCard';
import { PlaceDetailsModal } from './PlaceDetailsModal';
import { useFavorites } from '@/hooks/useFavorites';
import { AddListingModal } from '@/components/modals/AddListingModal';
import { FeedbackModal } from '@/components/modals/FeedbackModal';
import { DriverModal } from '@/components/delivery/DriverModal';
import { DriverDetailsModal } from '@/components/delivery/DriverDetailsModal';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FeedbackType } from '@/types';
import { trackSiteEvent } from '@/lib/analytics/client';
import { WHATSAPP_GROUP_URL } from '@/lib/community';

interface DirectoryViewProps {
  initialPlaces: Place[];
  initialDrivers: Driver[];
  isLoadingData?: boolean;
  directoryError?: string;
  renderedAt: number;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  initialPlaces,
  initialDrivers,
  isLoadingData = false,
  directoryError,
  renderedAt,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isDriverOpen, setIsDriverOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [invalidDetail, setInvalidDetail] = useState(false);
  const [closingDetailKey, setClosingDetailKey] = useState<string | null>(null);
  const [feedbackInitialPlaceId, setFeedbackInitialPlaceId] = useState<string>();
  const [feedbackInitialType, setFeedbackInitialType] = useState<FeedbackType>();

  useEffect(() => {
    const registration = new URLSearchParams(window.location.search).get('register');
    if (!registration) return;
    const frame = window.requestAnimationFrame(() => {
      if (registration === 'driver') setIsDriverOpen(true);
      else if (registration === 'place') setIsAddOpen(true);
      else setIsJoinOpen(true);
      const params = new URLSearchParams(window.location.search);
      params.delete('register');
      const nextUrl = params.size
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      router.replace(nextUrl, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  const { favorites, favoritesCount } = useFavorites();
  const activeOffersCount = useMemo(
    () => initialPlaces.reduce((total, place) => total + (place.coupons?.length ?? 0), 0),
    [initialPlaces],
  );
  const selectedPlaceId = searchParams.get('place');
  const selectedDriverId = selectedPlaceId ? null : searchParams.get('driver');
  const selectedPlace = selectedPlaceId
    ? initialPlaces.find((place) => place.id === selectedPlaceId) ?? null
    : null;
  const selectedDriver = selectedDriverId
    ? initialDrivers.find((driver) => driver.id === selectedDriverId) ?? null
    : null;
  const selectedDetailKey = selectedPlaceId || selectedDriverId;
  const isDetailClosing = Boolean(
    selectedDetailKey && closingDetailKey === selectedDetailKey,
  );

  useEffect(() => {
    if (searchQuery.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      trackSiteEvent('search_use', {
        targetType: 'feature',
        targetKey: 'directory_search',
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const removePlaceFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('place');
    params.delete('driver');
    return params.size ? `/?${params.toString()}` : '/';
  }, [searchParams]);

  useEffect(() => {
    const requestedId = selectedPlaceId || selectedDriverId;
    const selectedDetail = selectedPlace || selectedDriver;
    if (!requestedId || selectedDetail) return;
    const frame = window.requestAnimationFrame(() => {
      setInvalidDetail(true);
      router.replace(removePlaceFromUrl(), { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    removePlaceFromUrl,
    router,
    selectedDriver,
    selectedDriverId,
    selectedPlace,
    selectedPlaceId,
  ]);

  useEffect(() => {
    if (!selectedDriver) return;
    trackSiteEvent('driver_open', {
      targetType: 'driver',
      targetKey: selectedDriver.id,
    });
  }, [selectedDriver]);

  function detailHref(placeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('driver');
    params.set('place', placeId);
    return `/?${params.toString()}`;
  }

  function driverHref(driverId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('place');
    params.set('driver', driverId);
    return `/?${params.toString()}`;
  }

  function closeDetails(open: boolean) {
    if (open) return;
    const cleanUrl = removePlaceFromUrl();
    setClosingDetailKey(selectedDetailKey);
    router.replace(cleanUrl, { scroll: false });
  }

  function prepareOpenDetails() {
    setClosingDetailKey(null);
  }

  function suggestDetails(placeId: string) {
    setFeedbackInitialPlaceId(placeId);
    setFeedbackInitialType('details_update');
    setIsFeedbackOpen(true);
    closeDetails(false);
  }

  // Calculate counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: initialPlaces.length };
    initialPlaces.forEach((p) => {
      const cat = p.category as string;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [initialPlaces]);

  // Dynamic search, category, and favorites filtering
  const filteredPlaces = useMemo(() => {
    return initialPlaces.filter((place) => {
      // Favorites filter
      if (showFavoritesOnly && !favorites.includes(place.id)) return false;

      const matchesCategory =
        selectedCategory === 'all' || place.category === selectedCategory;

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        query === '' ||
        place.title.toLowerCase().includes(query) ||
        (place.description && place.description.toLowerCase().includes(query)) ||
        place.phone.includes(query) ||
        (place.whatsapp && place.whatsapp.includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [initialPlaces, selectedCategory, searchQuery, showFavoritesOnly, favorites]);

  return (
    <div className="dir-rtl flex min-h-screen flex-col bg-zinc-50 pb-20 text-zinc-950 sm:pb-0">
      {/* Navbar Header */}
      <Header
        isJoinOpen={isJoinOpen}
        onJoinOpenChange={(open) => {
          setIsJoinOpen(open);
          if (open) {
            trackSiteEvent('join_open', { targetType: 'feature', targetKey: 'join_menu' });
          }
        }}
        onOpenAddModal={() => {
          trackSiteEvent('add_listing_open', {
            targetType: 'feature',
            targetKey: 'add_listing',
          });
          setIsAddOpen(true);
        }}
        onOpenDriverModal={() => {
          trackSiteEvent('driver_signup_open', {
            targetType: 'feature',
            targetKey: 'driver_signup',
          });
          setIsDriverOpen(true);
        }}
        onOpenFeedbackModal={() => {
          trackSiteEvent('feedback_open', {
            targetType: 'feature',
            targetKey: 'feedback',
          });
          setIsFeedbackOpen(true);
        }}
      />

      {/* Main Directory Body */}
      <main id="main-content" className="flex-1 pb-12">
        <section className="relative overflow-hidden border-b border-zinc-800 bg-zinc-950 px-3 py-2.5 text-white sm:px-4 sm:py-8">
          <div className="mx-auto grid max-w-7xl items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)] lg:gap-14">
            <div className="min-w-0 max-w-2xl">
              <h1 className="text-balance text-[1.35rem] font-black leading-[1.35] tracking-tight text-white min-[360px]:text-[1.5rem] sm:text-4xl sm:leading-[1.2]">
                كل اللي تحتاجه في ديرتك، في مكان واحد.
              </h1>
              <p className="mt-1.5 text-xs font-medium leading-5 text-zinc-300 sm:mt-3 sm:max-w-xl sm:text-base sm:leading-8">
                مطاعم ومحلات وصيدليات وخدمات وكباتن توصيل.
              </p>
              <div className="mt-4 hidden flex-wrap gap-2 text-xs font-bold text-zinc-300 sm:flex">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">بيانات واضحة</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">تواصل بدون وسيط</span>
                {activeOffersCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <BadgePercent className="size-3.5" aria-hidden="true" />
                    {activeOffersCount.toLocaleString('ar-EG')} {activeOffersCount === 1 ? 'عرض' : 'عروض'}
                  </span>
                )}
              </div>
            </div>

            <div id="directory-search" className="w-full scroll-mt-20 lg:justify-self-end">
              <Input
                isClearable
                size="lg"
                radius="lg"
                placeholder="دور على مكان أو خدمة…"
                aria-label="البحث في الأماكن والخدمات"
                name="directorySearch"
                autoComplete="off"
                value={searchQuery}
                onValueChange={setSearchQuery}
                startContent={(
                  <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--dairtak-orange)] text-white">
                    <Search className="size-4.5" aria-hidden="true" />
                  </span>
                )}
                classNames={{
                  inputWrapper: 'h-[52px] rounded-2xl border border-zinc-200 !bg-white px-2 text-zinc-950 shadow-[0_8px_24px_-18px_rgba(0,0,0,.9)] focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-white/20',
                  input: '!bg-transparent !shadow-none text-base font-bold placeholder:font-medium placeholder:!text-zinc-500',
                }}
              />
              <div className="mt-3 hidden items-center justify-between gap-3 sm:flex">
                <p className="text-xs font-semibold text-zinc-400">اكتب الاسم، نوع الخدمة، أو رقم الهاتف.</p>
                <Button
                  as="a"
                  href={WHATSAPP_GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackSiteEvent('support_click', {
                    targetType: 'feature',
                    targetKey: 'hero_whatsapp_group',
                  })}
                  startContent={<MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />}
                  className="shrink-0 border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-950 hover:bg-zinc-100"
                >
                  اسأل جروب ديرتك
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-2.5 px-3 py-3 sm:space-y-5 sm:px-4 sm:py-6">
          <section aria-labelledby="daily-categories-title" className="space-y-2 rounded-[24px] bg-white py-1 sm:space-y-3 sm:rounded-[28px]">
            <div className="px-1">
              <h2 id="daily-categories-title" className="text-sm font-black text-zinc-950 sm:text-base">اختار القسم</h2>
              <p className="mt-0.5 hidden text-xs font-semibold text-zinc-500 sm:block">اضغط على القسم مرة تانية لإلغاء التصفية.</p>
            </div>
            <CategoryTabs
              selectedCategory={selectedCategory}
              onCategoryChange={(cat) => {
                setSelectedCategory(cat);
                setShowFavoritesOnly(false);
                trackSiteEvent('category_select', {
                  targetType: 'category',
                  targetKey: cat,
                });
              }}
              counts={categoryCounts}
            />
          </section>

          <DeliveryBar
            drivers={initialDrivers}
            renderedAt={renderedAt}
            driverHref={driverHref}
            onOpenDriverDetails={prepareOpenDetails}
          />

          <section aria-labelledby="directory-results-title" className="space-y-3 sm:space-y-5">
            <div className="flex items-center justify-between gap-2 px-1">
              <div>
                <h2 id="directory-results-title" className="text-sm font-black text-zinc-950 sm:text-base">الأماكن والخدمات</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                  عرض <strong className="font-black text-zinc-800">{filteredPlaces.length}</strong> مكان
                </p>
              </div>
              <Button
                size="sm"
                variant={showFavoritesOnly ? 'solid' : 'flat'}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                startContent={<Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-current' : ''}`} />}
                className={`self-start h-8 rounded-full px-3 text-xs font-bold transition-[background-color,color,box-shadow] ${
                  showFavoritesOnly
                    ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                    : 'border border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                المفضلة {favoritesCount > 0 && `(${favoritesCount})`}
              </Button>
            </div>

            {(searchQuery || showFavoritesOnly) && (
              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  setSearchQuery('');
                  setShowFavoritesOnly(false);
                }}
                startContent={<RefreshCw className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />}
                className="text-xs text-zinc-700 font-bold"
              >
                مسح الفلاتر
              </Button>
            )}

          {directoryError && (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-zinc-300 bg-white p-4 text-sm text-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <span>{directoryError}</span>
              <Button size="sm" onClick={() => window.location.reload()} className="bg-zinc-900 font-bold text-white">إعادة المحاولة</Button>
            </div>
          )}

          {invalidDetail && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700"
            >
              <span>البطاقة المطلوبة غير موجودة أو تم حذفها، وتم إبقاؤك في دليل ديرتك.</span>
              <Button
                isIconOnly
                variant="light"
                aria-label="إغلاق التنبيه"
                onClick={() => setInvalidDetail(false)}
              >
                ×
              </Button>
            </div>
          )}

          {/* Async Loading Skeleton State */}
          {isLoadingData ? (
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <Card key={n} className="w-full h-64 bg-white p-4 space-y-3">
                  <Skeleton className="w-full h-32 rounded-xl bg-zinc-200" />
                  <Skeleton className="w-3/4 h-5 rounded-lg bg-zinc-200" />
                  <Skeleton className="w-full h-4 rounded-lg bg-zinc-200" />
                </Card>
              ))}
            </div>
          ) : filteredPlaces.length > 0 ? (
            /* Places Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filteredPlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  detailsHref={detailHref(place.id)}
                  onOpenDetails={prepareOpenDetails}
                />
              ))}
            </div>
          ) : (
            /* Empty Search / Filter State */
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-900">
                {showFavoritesOnly ? <Heart className="w-7 h-7 stroke-1 text-zinc-700" /> : <MapPinOff className="w-7 h-7 stroke-1" />}
              </div>
              <h3 className="text-base font-bold text-zinc-800">
                {showFavoritesOnly
                  ? 'لم تضف أماكن للمفضلة بعد'
                  : 'لم يتم العثور على نتائج تطابق بحثك'}
              </h3>
              <p className="max-w-xs text-xs text-zinc-500">
                {showFavoritesOnly
                  ? 'استخدم زر المفضلة داخل أي مكان لحفظه هنا.'
                  : 'تأكد من كتابة الكلمات بشكل صحيح أو تواصل مع إدارة ديرتك لإضافة نشاطك.'}
              </p>
            </div>
          )}
          </section>
        </div>
      </main>

      <AddListingModal
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        placesList={initialPlaces}
      />
      <FeedbackModal
        key={`${feedbackInitialPlaceId ?? 'general'}:${feedbackInitialType ?? 'default'}`}
        isOpen={isFeedbackOpen}
        onOpenChange={(open) => {
          setIsFeedbackOpen(open);
          if (!open) {
            setFeedbackInitialPlaceId(undefined);
            setFeedbackInitialType(undefined);
          }
        }}
        placesList={initialPlaces}
        initialPlaceId={feedbackInitialPlaceId}
        initialFeedbackType={feedbackInitialType}
      />
      <DriverModal
        isOpen={isDriverOpen}
        onOpenChange={setIsDriverOpen}
        onSuccess={() => router.refresh()}
      />

      {/* Footer */}
      <footer className="w-full border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-1">
            <a href="/guide" className="inline-flex min-h-11 items-center rounded-xl px-3 font-bold text-zinc-700 hover:bg-zinc-100">
              طريقة استخدام الموقع
            </a>
            <a href="/share" className="inline-flex min-h-11 items-center rounded-xl px-3 font-bold text-zinc-700 hover:bg-zinc-100">
              ساعدنا في نشر ديرتك
            </a>
          </div>
          <a
            href={WHATSAPP_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackSiteEvent('support_click', {
              targetType: 'feature',
              targetKey: 'support_whatsapp_group',
            })}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-bold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
            aria-label="الانضمام إلى جروب ديرتك عبر واتساب"
          >
            <MessageCircle className="size-4 text-[var(--dairtak-orange)]" aria-hidden="true" />
            <span>انضم لجروب DAIRTAK على واتساب</span>
          </a>
          <div>© {new Date(renderedAt).getFullYear()} DAIRTAK — ديرتك</div>
        </div>
      </footer>

      <PlaceDetailsModal
        key={selectedPlace?.id ?? 'closed'}
        isOpen={Boolean(selectedPlace) && !isDetailClosing}
        onOpenChange={closeDetails}
        onSuggestDetails={suggestDetails}
        place={selectedPlace}
      />
      <DriverDetailsModal
        key={selectedDriver?.id ?? 'driver-closed'}
        isOpen={Boolean(selectedDriver) && !isDetailClosing}
        onOpenChange={closeDetails}
        driver={selectedDriver}
        renderedAt={renderedAt}
      />
    </div>
  );
};
