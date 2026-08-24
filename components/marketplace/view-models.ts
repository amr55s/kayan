import type { ReactNode } from 'react';

export type MarketplaceCurrency = 'EGP';

export type MarketplaceMoney = {
  amountMinor: number;
  currency: MarketplaceCurrency;
};

export type MarketplaceImageViewModel = {
  id: string;
  url: string;
  alt: string;
  blurDataUrl?: string | null;
};

export type MarketplaceRatingViewModel = {
  average: number;
  count: number;
};

export type MarketplaceStoreSummary = {
  id: string;
  name: string;
  slug: string;
  isVerified?: boolean;
};

export type MarketplaceProductSummary = {
  id: string;
  slug: string;
  name: string;
  store: MarketplaceStoreSummary;
  defaultVariantId?: string | null;
  primaryImage: MarketplaceImageViewModel | null;
  price: MarketplaceMoney;
  compareAtPrice?: MarketplaceMoney | null;
  rating?: MarketplaceRatingViewModel | null;
  isInStock: boolean;
  badge?: string | null;
  fulfillmentLabel?: string | null;
};

export type MarketplaceCategoryFilter = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
};

export type MarketplaceSortOption = {
  value: string;
  label: string;
};

export type MarketplaceStoreFilter = {
  slug: string;
  name: string;
  productCount: number;
};

export type MarketplaceCatalogViewModel = {
  products: MarketplaceProductSummary[];
  categories: MarketplaceCategoryFilter[];
  stores: MarketplaceStoreFilter[];
  sortOptions: MarketplaceSortOption[];
  query: string;
  selectedCategory: string | null;
  selectedStore: string | null;
  selectedSort: string;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  minRating: number | null;
  nextCursor: string | null;
  hasMore: boolean;
};

export type MarketplaceVariantOption = {
  id: string;
  label: string;
  price: MarketplaceMoney;
  isInStock: boolean;
  availableQuantity?: number | null;
};

export type MarketplaceProductDetailsViewModel = MarketplaceProductSummary & {
  images: MarketplaceImageViewModel[];
  description: string | null;
  highlights: string[];
  variants: MarketplaceVariantOption[];
  maxQuantityPerOrder: number;
  deliveryNote?: string | null;
  returnPolicyNote?: string | null;
};

export type MarketplaceCartLineViewModel = {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantLabel?: string | null;
  image: MarketplaceImageViewModel | null;
  unitPrice: MarketplaceMoney;
  quantity: number;
  maxQuantity: number;
  lineTotal: MarketplaceMoney;
  isAvailable: boolean;
};

export type MarketplaceCartStoreGroup = {
  store: MarketplaceStoreSummary;
  lines: MarketplaceCartLineViewModel[];
  subtotal: MarketplaceMoney;
};

export type MarketplaceCartViewModel = {
  groups: MarketplaceCartStoreGroup[];
  itemCount: number;
  subtotal: MarketplaceMoney;
  discount: MarketplaceMoney;
  estimatedDelivery: MarketplaceMoney | null;
  total: MarketplaceMoney;
  appliedPromoCode?: string | null;
};

export type MarketplaceDeliveryZone = {
  id: string;
  name: string;
  deliveryFee: MarketplaceMoney;
  storeOptions: Array<{
    storeId: string;
    choices: Array<{
      mode: 'platform' | 'self';
      label: string;
      deliveryFee: MarketplaceMoney;
      estimatedMinutesMin: number | null;
      estimatedMinutesMax: number | null;
    }>;
  }>;
};

export type MarketplaceSavedAddress = {
  id: string;
  zoneId: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
  isDefault: boolean;
};

export type MarketplaceCheckoutStoreGroup = {
  storeId: string;
  storeName: string;
  itemCount: number;
  subtotal: MarketplaceMoney;
};

export type MarketplaceCheckoutViewModel = {
  groups: MarketplaceCheckoutStoreGroup[];
  subtotal: MarketplaceMoney;
  discount: MarketplaceMoney;
  deliveryZones: MarketplaceDeliveryZone[];
  selectedZoneId: string | null;
  requiresAuthentication: boolean;
  loginHref: string;
  appliedPromoCode?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  addresses: MarketplaceSavedAddress[];
  selectedAddressId: string | null;
  captchaSlot?: ReactNode;
};

export type MarketplaceNavigationItem = {
  href: string;
  label: string;
  badge?: number;
};

export type MarketplaceRole = 'customer' | 'merchant' | 'admin' | 'driver';

export type MarketplaceFormAction = (formData: FormData) => void | Promise<void>;
