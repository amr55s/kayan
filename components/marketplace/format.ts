import type { MarketplaceMoney } from './view-models';

export function marketplaceProductHref(product: { id: string; slug: string }): string {
  return `/marketplace/products/${encodeURIComponent(product.id)}/${encodeURIComponent(product.slug)}`;
}

export function marketplaceStoreHref(slug: string): string {
  return `/marketplace?store=${encodeURIComponent(slug)}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMarketplaceMoney(money: MarketplaceMoney): string {
  const key = `ar-EG:${money.currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: money.currency,
      minimumFractionDigits: money.amountMinor % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    formatters.set(key, formatter);
  }

  return formatter.format(money.amountMinor / 100);
}

const countFormatter = new Intl.NumberFormat('ar-EG');
const ratingFormatter = new Intl.NumberFormat('ar-EG', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Same digit shapes as prices, so a card never mixes ٨٥ with 4.6. */
export function formatMarketplaceCount(value: number): string {
  return countFormatter.format(value);
}

export function formatMarketplaceRating(average: number): string {
  return ratingFormatter.format(average);
}

/** Arabic counted-noun agreement: منتج واحد، منتجان، ٣ منتجات، ١١ منتجًا. */
export function formatMarketplaceQuantity(
  count: number,
  noun: { one: string; two: string; few: string; many: string },
): string {
  if (count === 1) return noun.one;
  if (count === 2) return noun.two;
  const lastTwo = count % 100;
  const form = lastTwo >= 3 && lastTwo <= 10 ? noun.few : noun.many;
  return `${formatMarketplaceCount(count)} ${form}`;
}

export const MARKETPLACE_PRODUCT_NOUN = {
  one: 'منتج واحد',
  two: 'منتجان',
  few: 'منتجات',
  many: 'منتجًا',
} as const;

export const MARKETPLACE_ITEM_NOUN = {
  one: 'عنصر واحد',
  two: 'عنصران',
  few: 'عناصر',
  many: 'عنصرًا',
} as const;

export const MARKETPLACE_REVIEW_NOUN = {
  one: 'تقييم واحد',
  two: 'تقييمان',
  few: 'تقييمات',
  many: 'تقييمًا',
} as const;

export function marketplaceDiscountPercentage(
  price: MarketplaceMoney,
  compareAtPrice?: MarketplaceMoney | null,
): number | null {
  if (
    !compareAtPrice ||
    compareAtPrice.currency !== price.currency ||
    compareAtPrice.amountMinor <= price.amountMinor ||
    compareAtPrice.amountMinor <= 0
  ) {
    return null;
  }

  return Math.round(
    ((compareAtPrice.amountMinor - price.amountMinor) / compareAtPrice.amountMinor) * 100,
  );
}

export function addMarketplaceMoney(
  ...values: MarketplaceMoney[]
): MarketplaceMoney {
  const currency = values[0]?.currency ?? 'EGP';
  return {
    currency,
    amountMinor: values.reduce((total, value) => {
      if (value.currency !== currency) {
        throw new Error('Marketplace totals cannot mix currencies.');
      }
      return total + value.amountMinor;
    }, 0),
  };
}
