import { MerchantProductList } from '@/components/marketplace/merchant/product-list';
import { StoreOnboardingPanel } from '@/components/marketplace/operational-setup-panels';
import type { MerchantProductStatus, MerchantStockStatus } from '@/components/marketplace/merchant/view-models';
import {
  archiveMerchantProductAction,
  submitMerchantProductForReviewAction,
} from '@/app/merchant/marketplace/actions';
import { fetchMerchantProductList } from '@/lib/commerce/merchant-products';
import { listMyManageableMerchants } from '@/lib/commerce/operational-setup';
import { createMarketplaceStoreAction } from '@/app/merchant/marketplace/setup-actions';

const productStatuses = new Set<MerchantProductStatus>(['draft', 'pending_review', 'active', 'rejected', 'archived']);
const stockStatuses = new Set<MerchantStockStatus>(['in_stock', 'low_stock', 'out_of_stock', 'not_tracked']);
const messages: Record<string, string> = {
  archived: 'تمت أرشفة المنتج وإزالته من الكتالوج العام.',
  submitted: 'تم إرسال المنتج للمراجعة.',
};
const errors: Record<string, string> = {
  access_denied: 'لا تملك صلاحية إدارة هذا المتجر.',
  conflict: 'تغيّر المنتج في جلسة أخرى. حدّث الصفحة قبل إعادة المحاولة.',
  invalid_input: 'بيانات العملية غير صالحة.',
  not_found: 'المنتج المطلوب غير موجود.',
  service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
};

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function MerchantMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = single(params.status) || 'all';
  const rawStock = single(params.stock) || 'all';
  const status = rawStatus === 'all' || productStatuses.has(rawStatus as MerchantProductStatus)
    ? rawStatus as MerchantProductStatus | 'all' : 'all';
  const stock = rawStock === 'all' || stockStatuses.has(rawStock as MerchantStockStatus)
    ? rawStock as MerchantStockStatus | 'all' : 'all';
  const page = Math.min(Math.max(Number.parseInt(single(params.page) || '1', 10) || 1, 1), 1_000);
  const viewModel = await fetchMerchantProductList({
    page,
    query: single(params.q),
    status,
    stock,
    storeId: single(params.store) || null,
  });
  const notice = messages[single(params.notice)];
  const error = errors[single(params.error)];

  if (!viewModel.store) {
    const merchants = await listMyManageableMerchants();
    return <StoreOnboardingPanel merchants={merchants} action={createMarketplaceStoreAction} />;
  }

  return (
    <>
      {notice ? <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p> : null}
      {error ? <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900">{error}</p> : null}
      <MerchantProductList
        viewModel={viewModel}
        actions={{
          archiveProductAction: archiveMerchantProductAction,
          submitForReviewAction: submitMerchantProductForReviewAction,
        }}
      />
    </>
  );
}
