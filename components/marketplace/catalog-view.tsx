'use client';

import Link from 'next/link';
import { useOverlayState } from '@heroui/react';
import { Button } from '@heroui/react/button';
import { Drawer } from '@heroui/react/drawer';
import { Filter, X } from 'lucide-react';
import { CatalogFilters, countActiveCatalogFilters } from './catalog-filters';
import { MarketplaceProductCard } from './product-card';
import { MarketplaceStatePanel } from './state-panel';
import { ChatEntryButton } from './chat/chat-entry-button';
import type { ChatRecoveryCode } from './chat/chat-entry-state';
import type { ChatLoginIntent } from '@/lib/auth/safe-next';
import type {
  MarketplaceCatalogViewModel,
  MarketplaceFormAction,
} from './view-models';
import styles from './marketplace.module.css';

type MarketplaceCatalogProps = {
  model: MarketplaceCatalogViewModel;
  addToCartAction?: MarketplaceFormAction;
  storeChat?: {
    intent: ChatLoginIntent;
    returnTo: string;
    loginHref: string;
    isAuthenticated: boolean;
    storeName: string;
    recovery?: ChatRecoveryCode | null;
  } | null;
};

function catalogHref(
  model: MarketplaceCatalogViewModel,
  changes: { category?: string | null; cursor?: string | null },
): string {
  const params = new URLSearchParams();
  if (model.query) params.set('q', model.query);
  if (model.selectedSort) params.set('sort', model.selectedSort);
  if (model.selectedStore) params.set('store', model.selectedStore);
  if (model.minPrice) params.set('min_price', model.minPrice);
  if (model.maxPrice) params.set('max_price', model.maxPrice);
  if (model.inStockOnly) params.set('stock', '1');
  if (model.minRating) params.set('rating', String(model.minRating));

  const category = changes.category === undefined
    ? model.selectedCategory
    : changes.category;
  if (category) params.set('category', category);

  if (changes.cursor) params.set('cursor', changes.cursor);
  const query = params.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
}

export function MarketplaceCatalog({ model, addToCartAction, storeChat }: MarketplaceCatalogProps) {
  const mobileDrawerState = useOverlayState();
  const activeCount = countActiveCatalogFilters(model);

  return (
    <section aria-labelledby="marketplace-catalog-title">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>المتجر</p>
          <h1 id="marketplace-catalog-title" className={styles.title}>اكتشف منتجات من متاجر منطقتك</h1>
          <p className={styles.subtitle}>
            ابحث وقارن ثم أكمل الطلب والدفع عند الاستلام من داخل الموقع.
          </p>
        </div>
        {storeChat ? (
          <div className="w-full max-w-sm shrink-0" dir="rtl">
            <ChatEntryButton
              intent={storeChat.intent}
              returnTo={storeChat.returnTo}
              loginHref={storeChat.loginHref}
              isAuthenticated={storeChat.isAuthenticated}
              recovery={storeChat.recovery}
              label={`اسأل متجر ${storeChat.storeName}`}
            />
          </div>
        ) : null}
      </header>

      <div className={styles.catalogLayout}>
        {/* Persistent Desktop Sidebar */}
        <aside className={styles.catalogSidebar} aria-label="تصفية المنتجات">
          <CatalogFilters model={model} idPrefix="desktop" />
        </aside>

        {/* Main Content Column */}
        <div className={styles.catalogMain}>
          {/* Mobile Filter Trigger Bar */}
          <div className={styles.mobileFilterBar}>
            <Button
              onPress={() => mobileDrawerState.open()}
              className={styles.mobileFilterButton}
              aria-label={`تصفية المنتجات${activeCount > 0 ? `، ${activeCount} فلاتر نشطة` : ''}`}
            >
              <Filter className="size-4" aria-hidden="true" />
              <span>تصفية المنتجات</span>
              {activeCount > 0 ? <span className={styles.badge}>{activeCount}</span> : null}
            </Button>
            {activeCount > 0 ? (
              <Link href="/marketplace" className={styles.secondaryButton}>
                مسح الفلاتر
              </Link>
            ) : null}
          </div>

          <p className={styles.resultSummary} aria-live="polite">
            {model.products.length > 0
              ? `تم تحميل ${model.products.length} منتج مطابق${model.hasMore ? ' — توجد نتائج أخرى' : ''}`
              : 'لا توجد منتجات مطابقة'}
          </p>

          {model.products.length > 0 ? (
            <div className={styles.productGrid}>
              {model.products.map((product) => (
                <MarketplaceProductCard
                  key={product.id}
                  product={product}
                  addToCartAction={addToCartAction}
                />
              ))}
            </div>
          ) : (
            <MarketplaceStatePanel
              title="لم نجد منتجات بهذه المواصفات"
              description="جرّب تعديل كلمات البحث أو اختيار فئة أخرى. لن نعرض نتائج بديلة غير مرتبطة بطلبك."
              actionHref="/marketplace"
              actionLabel="مسح عوامل البحث"
            />
          )}

          {model.hasMore && model.nextCursor ? (
            <nav className={styles.pagination} aria-label="متابعة نتائج المنتجات">
              <Link className={styles.pageLink} href={catalogHref(model, { cursor: model.nextCursor })}>
                النتائج التالية
              </Link>
            </nav>
          ) : null}
        </div>
      </div>

      {/* Accessible Mobile Filter Drawer */}
      <Drawer state={mobileDrawerState}>
        <Drawer.Backdrop variant="blur" className="z-[100] bg-zinc-950/45">
          <Drawer.Content placement="bottom" className="max-h-[85dvh] rounded-t-3xl border-t border-zinc-200 bg-white">
            <Drawer.Dialog aria-label="تصفية نتائج المنتجات" dir="rtl">
              <Drawer.Header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <Drawer.Heading className="text-base font-black text-zinc-950">
                  تصفية المنتجات {activeCount > 0 ? `(${activeCount})` : ''}
                </Drawer.Heading>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  onPress={() => mobileDrawerState.close()}
                  aria-label="إغلاق نافذة التصفية"
                  className="size-10"
                >
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </Drawer.Header>
              <Drawer.Body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
                <CatalogFilters
                  model={model}
                  idPrefix="mobile"
                  isMobileDrawer
                  onApply={() => mobileDrawerState.close()}
                />
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </section>
  );
}
