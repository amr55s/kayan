import { ListSkeleton } from '@/components/ui/page-skeleton';

export default function MarketplaceCartLoading() {
  return <ListSkeleton label="جارٍ تحميل السلة" rows={3} embedded />;
}
