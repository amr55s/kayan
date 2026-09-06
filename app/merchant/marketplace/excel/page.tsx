import { randomUUID } from 'node:crypto';
import { MerchantExcelPanel } from '@/components/marketplace/merchant/excel-panel';
import type { MerchantExcelPanelViewModel } from '@/components/marketplace/merchant/view-models';
import { fetchMerchantExcelPage } from '@/lib/commerce/merchant-excel';
import { processMerchantWorkbookAction } from './actions';

export default async function MerchantMarketplaceExcelPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const query = await searchParams;
  const page = await fetchMerchantExcelPage(query.store ?? null);
  const viewModel: MerchantExcelPanelViewModel = {
    storeId: page.storeId,
    storeName: page.storeName,
    importIdempotencyKey: randomUUID(),
    validation: {
      status: 'idle',
      jobId: null,
      jobUpdatedAt: null,
      filename: null,
      productRows: 0,
      variantRows: 0,
      imageRows: 0,
      issues: [],
      message: null,
    },
    jobs: page.jobs,
    exportState: {
      status: page.storeId ? 'ready' : 'idle',
      downloadUrl: page.storeId
        ? `/merchant/marketplace/excel/export?store=${encodeURIComponent(page.storeId)}`
        : null,
      filename: page.storeId ? 'dairtak-products.xlsx' : null,
      message: null,
    },
  };

  return <MerchantExcelPanel viewModel={viewModel} actions={{ processWorkbookAction: processMerchantWorkbookAction }} />;
}
