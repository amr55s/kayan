import Image from 'next/image';
import Link from 'next/link';
import { Archive, PackageOpen, Search, Send } from 'lucide-react';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { formatMarketplaceMoney } from '../format';
import { MerchantStatePanel } from './merchant-state-panel';
import { ProductStatusBadge, StockStatusBadge } from './status-badge';
import type {
  MerchantProductListActions,
  MerchantProductListViewModel,
  MerchantProductStatus,
  MerchantStockStatus,
} from './view-models';
import styles from './merchant-marketplace.module.css';

const statusOptions: Array<{ value: MerchantProductStatus | 'all'; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'draft', label: 'مسودة' },
  { value: 'pending_review', label: 'قيد المراجعة' },
  { value: 'active', label: 'منشور' },
  { value: 'rejected', label: 'مرفوض' },
  { value: 'archived', label: 'مؤرشف' },
];

const stockOptions: Array<{ value: MerchantStockStatus | 'all'; label: string }> = [
  { value: 'all', label: 'كل حالات المخزون' },
  { value: 'in_stock', label: 'متوفر' },
  { value: 'low_stock', label: 'مخزون منخفض' },
  { value: 'out_of_stock', label: 'نفد المخزون' },
  { value: 'not_tracked', label: 'غير متتبع' },
];

function catalogHref(
  filters: MerchantProductListViewModel['filters'],
  page: number,
) {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.stock !== 'all') params.set('stock', filters.stock);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/merchant/marketplace${query ? `?${query}` : ''}`;
}

function formatPriceRange(product: MerchantProductListViewModel['products'][number]) {
  if (!product.minimumPrice) return 'لم يحدد سعر';
  const minimum = formatMarketplaceMoney(product.minimumPrice);
  if (
    !product.maximumPrice
    || product.maximumPrice.amountMinor === product.minimumPrice.amountMinor
  ) {
    return minimum;
  }
  return `${minimum} – ${formatMarketplaceMoney(product.maximumPrice)}`;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return 'غير متاح';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Cairo',
  }).format(date);
}

export function MerchantProductList({
  viewModel,
  actions = {},
}: {
  viewModel: MerchantProductListViewModel;
  actions?: MerchantProductListActions;
}) {
  if (viewModel.loadState.kind === 'error') {
    return (
      <MerchantStatePanel
        kind="error"
        title={viewModel.loadState.title}
        description={viewModel.loadState.description}
        action={{ href: '/merchant/marketplace', label: 'إعادة المحاولة' }}
      />
    );
  }

  const emptyState = viewModel.loadState.kind === 'empty'
    ? viewModel.loadState
    : {
        title: 'لا توجد منتجات مطابقة',
        description: 'جرّب تغيير البحث أو الفلاتر، أو أضف أول منتج إلى متجرك.',
      };

  return (
    <div>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>إدارة الكتالوج</p>
          <h1 className={styles.title}>المنتجات والمخزون</h1>
          <p className={styles.subtitle}>
            راجع حالة النشر والأسعار والمخزون لكل منتج من مكان واحد.
          </p>
        </div>
        <div className={styles.inlineActions}>
          <Link href="/merchant/marketplace/excel">
            <Button.Root className={styles.secondaryLink}>
              استيراد أو تصدير Excel
            </Button.Root>
          </Link>
          <Link href="/merchant/marketplace/new">
            <Button.Root className={styles.primaryLink}>
              إضافة منتج
            </Button.Root>
          </Link>
        </div>
      </header>

      <form
        action="/merchant/marketplace"
        method="get"
        role="search"
        className={styles.toolbar}
      >
        <div className={styles.fieldGroup}>
          <Label.Root htmlFor="merchant-catalog-query" className={styles.label}>
            ابحث في الكتالوج
          </Label.Root>
          <Input.Root
            id="merchant-catalog-query"
            name="q"
            type="search"
            defaultValue={viewModel.filters.query}
            placeholder="اسم المنتج أو SKU أو كود المنتج"
            autoComplete="off"
            className={styles.field}
          />
        </div>
        <label className={styles.fieldGroup} htmlFor="merchant-catalog-status">
          <span className={styles.label}>حالة النشر</span>
          <select
            id="merchant-catalog-status"
            name="status"
            defaultValue={viewModel.filters.status}
            className={styles.select}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.fieldGroup} htmlFor="merchant-catalog-stock">
          <span className={styles.label}>المخزون</span>
          <select
            id="merchant-catalog-stock"
            name="stock"
            defaultValue={viewModel.filters.stock}
            className={styles.select}
          >
            {stockOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <Button.Root type="submit" className={styles.primaryButton}>
          <Search size={16} aria-hidden="true" />
          تطبيق
        </Button.Root>
      </form>

      <div className={styles.summaryBar} aria-live="polite">
        <p className={styles.muted}>
          {viewModel.pagination.totalResults.toLocaleString('ar-EG')} منتج
          {viewModel.store ? ` في ${viewModel.store.name}` : ''}
        </p>
        <p className={styles.muted}>
          الصفحة {viewModel.pagination.page.toLocaleString('ar-EG')} من{' '}
          {viewModel.pagination.pageCount.toLocaleString('ar-EG')}
        </p>
      </div>

      {viewModel.products.length === 0 ? (
        <MerchantStatePanel
          kind="empty"
          title={emptyState.title}
          description={emptyState.description}
          action={{ href: '/merchant/marketplace/new', label: 'إضافة أول منتج' }}
        />
      ) : (
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <caption className={styles.screenReaderOnly}>منتجات المتجر وحالة المخزون والنشر</caption>
            <thead>
              <tr>
                <th scope="col">المنتج</th>
                <th scope="col">الحالة</th>
                <th scope="col">المخزون</th>
                <th scope="col">السعر</th>
                <th scope="col">التصنيف</th>
                <th scope="col">آخر تحديث</th>
                <th scope="col">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className={styles.productIdentity}>
                      {product.thumbnail ? (
                        <Image
                          src={product.thumbnail.url}
                          alt={product.thumbnail.alt}
                          width={52}
                          height={52}
                          sizes="52px"
                          className={styles.thumbnail}
                        />
                      ) : (
                        <span className={styles.thumbnailPlaceholder} aria-label="لا توجد صورة">
                          <PackageOpen size={18} aria-hidden="true" />
                        </span>
                      )}
                      <div>
                        <p className={styles.productName}>{product.name}</p>
                        <p className={styles.productKey}>{product.productKey}</p>
                        <p className={styles.meta}>
                          {product.brand || 'بدون علامة تجارية'} ·{' '}
                          {product.variantCount.toLocaleString('ar-EG')} متغير
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <ProductStatusBadge status={product.status} />
                    {product.moderationNote ? (
                      <p className={styles.moderationNote}>{product.moderationNote}</p>
                    ) : null}
                  </td>
                  <td>
                    <StockStatusBadge status={product.stockStatus} />
                    <p className={styles.meta}>
                      {product.availableQuantity == null
                        ? 'الكمية غير متتبعة'
                        : `${product.availableQuantity.toLocaleString('ar-EG')} متاح`}
                    </p>
                  </td>
                  <td className={styles.priceRange}>{formatPriceRange(product)}</td>
                  <td>{product.categoryName || 'غير مصنف'}</td>
                  <td>{formatUpdatedAt(product.updatedAt)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <Link
                        href={`/merchant/marketplace/${encodeURIComponent(product.id)}/edit`}
                      >
                        <Button.Root className={styles.textLink}>
                          تعديل
                        </Button.Root>
                      </Link>
                      {product.status === 'draft' || product.status === 'rejected' ? (
                        <form action={actions.submitForReviewAction}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="intent" value="submit-for-review" />
                          <Button.Root
                            type="submit"
                            isDisabled={!actions.submitForReviewAction}
                            className={styles.secondaryButton}
                            aria-label={`إرسال ${product.name} للمراجعة`}
                          >
                            <Send size={14} aria-hidden="true" />
                            مراجعة
                          </Button.Root>
                        </form>
                      ) : null}
                      {product.status !== 'archived' ? (
                        <form action={actions.archiveProductAction}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="intent" value="archive-product" />
                          <input type="hidden" name="expectedUpdatedAt" value={product.updatedAt || ''} />
                          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                          <Button.Root
                            type="submit"
                            isDisabled={!actions.archiveProductAction}
                            className={styles.dangerButton}
                            aria-label={`أرشفة ${product.name}`}
                          >
                            <Archive size={14} aria-hidden="true" />
                            أرشفة
                          </Button.Root>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewModel.pagination.pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="صفحات منتجات المتجر">
          {viewModel.pagination.page > 1 ? (
            <Link
              href={catalogHref(viewModel.filters, viewModel.pagination.page - 1)}
            >
              <Button.Root className={styles.paginationLink}>
                السابق
              </Button.Root>
            </Link>
          ) : null}
          <span className={styles.paginationCurrent} aria-current="page">
            {viewModel.pagination.page.toLocaleString('ar-EG')}
          </span>
          {viewModel.pagination.page < viewModel.pagination.pageCount ? (
            <Link
              href={catalogHref(viewModel.filters, viewModel.pagination.page + 1)}
            >
              <Button.Root className={styles.paginationLink}>
                التالي
              </Button.Root>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
