import { MerchantStatePanel } from '@/components/marketplace/merchant/merchant-state-panel';

export default function MerchantMarketplaceLoading() {
  return (
    <MerchantStatePanel
      kind="loading"
      title="جارٍ تحميل الكتالوج"
      description="نجهز المنتجات والمخزون وحالات النشر."
    />
  );
}
