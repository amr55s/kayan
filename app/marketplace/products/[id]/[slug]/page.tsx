import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { MarketplaceProductDetails } from '@/components/marketplace/product-details';
import { marketplaceProductHref } from '@/components/marketplace/format';
import { fetchMarketplaceProduct } from '@/lib/commerce/catalog';
import { addMarketplaceCartItemAction } from '@/app/marketplace/actions';
import { absoluteSiteUrl } from '@/lib/seo/site';
import { serializeJsonLd } from '@/lib/seo/json-ld';
import { createChatLoginHref } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const loadProduct = cache(fetchMarketplaceProduct);

type ProductPageProps = {
  params: Promise<{ id: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) return {
    title: 'المنتج غير موجود | ديرتك',
    robots: { index: false, follow: false },
  };
  const canonical = marketplaceProductHref(product);
  const description = product.description?.replace(/\s+/gu, ' ').trim().slice(0, 160)
    || `اطلب ${product.name} من ${product.store.name} عبر ديرتك.`;
  const socialImage = product.primaryImage
    ? [{ url: product.primaryImage.url, alt: product.primaryImage.alt }]
    : undefined;
  return {
    title: `${product.name} | ديرتك`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${product.name} | ديرتك`,
      description,
      url: canonical,
      type: 'website',
      images: socialImage,
    },
    twitter: {
      card: socialImage ? 'summary_large_image' : 'summary',
      title: `${product.name} | ديرتك`,
      description,
      images: socialImage,
    },
  };
}

function productJsonLd(product: Awaited<ReturnType<typeof loadProduct>>) {
  if (!product) return null;
  const canonical = absoluteSiteUrl(marketplaceProductHref(product));
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    name: product.name,
    description: product.description || undefined,
    image: product.images.map((image) => image.url),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'EGP',
      price: (product.price.amountMinor / 100).toFixed(2),
      availability: product.isInStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: product.store.name },
    },
    ...(product.rating && product.rating.count > 0 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating.average,
        reviewCount: product.rating.count,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
  };
}

export default async function MarketplaceProductPage({ params, searchParams }: ProductPageProps) {
  const { id, slug } = await params;
  const product = await loadProduct(id);
  if (!product) notFound();
  if (slug !== product.slug) redirect(marketplaceProductHref(product));
  const returnTo = marketplaceProductHref(product);
  const intent = { kind: 'presale', storeId: product.store.id, productId: product.id } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const recoveryValue = (await searchParams)?.chat_recovery;
  const chatRecovery = recoveryValue === 'authentication_required'
    || recoveryValue === 'rate_limited'
    || recoveryValue === 'service_unavailable'
    || recoveryValue === 'profile_setup'
    ? recoveryValue
    : null;
  const structuredData = productJsonLd(product);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <MarketplaceProductDetails
        product={product}
        addToCartAction={addMarketplaceCartItemAction}
        isAuthenticated={Boolean(user)}
        chatLoginHref={createChatLoginHref({ returnTo, intent })}
        chatRecovery={chatRecovery}
      />
    </>
  );
}
