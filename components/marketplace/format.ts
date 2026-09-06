import type { MarketplaceMoney } from './view-models';

export function marketplaceProductHref(product: { id: string; slug: string }): string {
  return `/marketplace/products/${encodeURIComponent(product.id)}/${encodeURIComponent(product.slug)}`;
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
