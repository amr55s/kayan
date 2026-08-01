'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, Button, Skeleton, Card } from '@heroui/react';
import { BadgePercent, Bike, Search, MapPinOff, RefreshCw, Heart, MessageCircle } from 'lucide-react';
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

      {/* Live Active Delivery Drivers Bar */}
      <DeliveryBar
        drivers={initialDrivers}
        renderedAt={renderedAt}
        driverHref={driverHref}
        onOpenDriverDetails={prepareOpenDetails}
      />

      {/* Main Directory Body */}
      <main id="main-content" className="flex-1 pb-12">
        {/* Compact Hero Banner */}
        <section className="border-b border-zinc-200/70 bg-white px-4 py-6 text-center sm:py-10">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
              KAYAN CITY SPOT… كل ما تحتاجه في مكان واحد
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-pretty text-sm font-normal text-zinc-500 sm:text-base">
              مطاعم ومحلات وصيدليات وخدمات وتوصيل ومنيوهات، مع تواصل مباشر وسهل.
            </p>
            <div className="mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-zinc-700">
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3">
                <MessageCircle className="size-3.5 text-emerald-600" aria-hidden="true" />
                تواصل مباشر مع المتجر
              </span>
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3">
                <Bike className="size-3.5" aria-hidden="true" />
                كباتن توصيل متاحون
              </span>
              {activeOffersCount > 0 && (
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-amber-900">
                  <BadgePercent className="size-3.5" aria-hidden="true" />
                  {activeOffersCount === 1
                    ? 'عرض واحد متاح'
                    : `${activeOffersCount.toLocaleString('ar-EG')} عروض وكوبونات`}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Filter Controls & Search */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="w-full space-y-3 sm:space-y-4">
            <Input
              isClearable
              size="lg"
              radius="lg"
              placeholder="ابحث عن اسم مكان، محل، صيدلية، أو هاتف…"
              aria-label="البحث في الأماكن والخدمات"
              name="directorySearch"
              autoComplete="off"
              value={searchQuery}
              onValueChange={setSearchQuery}
              startContent={<Search className="w-5 h-5 text-zinc-400 shrink-0" />}
              classNames={{
                inputWrapper: "h-12 border-zinc-300 bg-white shadow-none",
                input: "text-base font-medium",
              }}
            />

            {/* Category Filter Tabs + Favorites Toggle */}
            <div className="flex flex-col gap-3">
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

              {/* Favorites Toggle */}
              <Button
                size="sm"
                variant={showFavoritesOnly ? 'solid' : 'flat'}
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                startContent={<Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-current' : ''}`} />}
                className={`self-start font-bold text-xs h-8 rounded-full px-3 transition-[background-color,color,box-shadow] ${
                  showFavoritesOnly
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'border border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                المفضلة {favoritesCount > 0 && `(${favoritesCount})`}
              </Button>
            </div>
          </div>

          {/* Results Summary Header */}
          <div className="flex items-center justify-between px-1 text-xs font-bold text-zinc-600">
            <span>
              عرض <strong className="text-sm font-extrabold text-zinc-950">{filteredPlaces.length}</strong> مكان
            </span>
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
          </div>

          {directoryError && (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <span>{directoryError}</span>
              <Button size="sm" onClick={() => window.location.reload()} className="bg-zinc-900 font-bold text-white">إعادة المحاولة</Button>
            </div>
          )}

          {invalidDetail && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700"
            >
              <span>البطاقة المطلوبة غير موجودة أو تم حذفها، وتم إبقاؤك في دليل كيان.</span>
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
                  : 'تأكد من كتابة الكلمات بشكل صحيح أو تواصل مع إدارة كيان سيتي سبوت لإضافة نشاطك.'}
              </p>
            </div>
          )}
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
              ساعدنا في نشر كيان
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
            aria-label="الانضمام إلى جروب KAYAN CITY SPOT عبر واتساب"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            <span>انضم لجروب KAYAN CITY SPOT على واتساب</span>
          </a>
          <div>© {new Date(renderedAt).getFullYear()} KAYAN CITY SPOT</div>
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
      />
    </div>
  );
};
