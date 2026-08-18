import { MarketplaceStatePanel } from '@/components/marketplace/state-panel';

export default function MarketplaceNotFound() {
  return (
    <MarketplaceStatePanel
      title="الصفحة أو المنتج غير موجود"
      description="قد يكون المنتج حُذف أو لم يعد منشورًا. ارجع إلى المتجر للاطلاع على المنتجات المتاحة حاليًا."
      actionHref="/marketplace"
      actionLabel="العودة إلى المتجر"
    />
  );
}
