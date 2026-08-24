import { MerchantStatePanel } from '@/components/marketplace/merchant/merchant-state-panel';

export default function MerchantMarketplaceNotFound() {
  return (
    <MerchantStatePanel
      kind="empty"
      title="المنتج غير موجود"
      description="قد يكون المنتج مؤرشفًا أو لا يتبع المتجر الحالي."
      action={{ href: '/merchant/marketplace', label: 'العودة للمنتجات' }}
    />
  );
}
