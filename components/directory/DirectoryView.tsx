'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Input, Button, Skeleton, Card } from '@heroui/react';
import { Search, MapPinOff, RefreshCw, Heart } from 'lucide-react';
import { Place, Driver, CategoryType } from '@/types';
import { Header } from '@/components/layout/Header';
import { DeliveryBar } from '@/components/delivery/DeliveryBar';
import { CategoryTabs } from './CategoryTabs';
import { PlaceCard } from './PlaceCard';
import { PwaInstaller } from '@/components/layout/PwaInstaller';
import { useFavorites } from '@/hooks/useFavorites';
import { AddListingModal } from '@/components/modals/AddListingModal';
import { FeedbackModal } from '@/components/modals/FeedbackModal';
import { DriverModal } from '@/components/delivery/DriverModal';
import { useRouter } from 'next/navigation';

interface DirectoryViewProps {
  initialPlaces: Place[];
  initialDrivers: Driver[];
  isLoadingData?: boolean;
  directoryError?: string;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  initialPlaces,
  initialDrivers,
  isLoadingData = false,
  directoryError,
}) => {
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isDriverOpen, setIsDriverOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  useEffect(() => {
    const registration = new URLSearchParams(window.location.search).get('register');
    if (!registration) return;
    const frame = window.requestAnimationFrame(() => {
      if (registration === 'driver') setIsDriverOpen(true);
      else if (registration === 'place') setIsAddOpen(true);
      else setIsJoinOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const { favorites, favoritesCount } = useFavorites();

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
        onJoinOpenChange={setIsJoinOpen}
        onOpenAddModal={() => setIsAddOpen(true)}
        onOpenDriverModal={() => setIsDriverOpen(true)}
        onOpenFeedbackModal={() => setIsFeedbackOpen(true)}
      />

      {/* Live Active Delivery Drivers Bar */}
      <DeliveryBar drivers={initialDrivers} onOpenRegistration={() => setIsDriverOpen(true)} />

      {/* Main Directory Body */}
      <main className="flex-1 pb-12">
        {/* Compact Hero Banner */}
        <div className="bg-gradient-to-b from-zinc-200/50 via-zinc-100/20 to-transparent dark:from-zinc-900/40 dark:via-zinc-900/10 py-5 sm:py-7 px-4 text-center border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="max-w-2xl mx-auto space-y-1">
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
              KAYAN CITY SPOT | كيان سيتي سبوت… كل ما تحتاجه في مكان واحد
            </h1>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 font-semibold">
              مطاعم ومحلات وصيدليات وخدمات وتوصيل ومنيوهات، مع تواصل مباشر وسهل.
            </p>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="w-full space-y-3 sm:space-y-4">
            <Input
              isClearable
              size="lg"
              radius="lg"
              placeholder="ابحث عن اسم مكان، محل، صيدلية، أو هاتف..."
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
                <PlaceCard key={place.id} place={place} />
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

      {/* PWA Install Banner */}
      <PwaInstaller />

      <AddListingModal
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        placesList={initialPlaces}
      />
      <FeedbackModal isOpen={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} placesList={initialPlaces} />
      <DriverModal
        isOpen={isDriverOpen}
        onOpenChange={setIsDriverOpen}
        onSuccess={() => router.refresh()}
      />

      {/* Footer */}
      <footer className="w-full border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-500">
        <div className="mx-auto max-w-7xl">© {new Date().getFullYear()} KAYAN CITY SPOT | كيان سيتي سبوت</div>
      </footer>

    </div>
  );
};
