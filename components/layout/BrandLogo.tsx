import Image from 'next/image';
import { SITE_NAME } from '@/lib/brand';

type BrandLogoVariant = 'mark' | 'wordmark' | 'full';

const LOGOS: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  mark: {
    src: '/brand/dairtak-mark.svg',
    width: 95,
    height: 94.79,
  },
  wordmark: {
    src: '/brand/dairtak-wordmark.svg',
    width: 209.94,
    height: 84.01,
  },
  full: {
    src: '/brand/dairtak-logo.svg',
    width: 326.69,
    height: 94.79,
  },
};

const LOGO_SIZES: Record<BrandLogoVariant, string> = {
  mark: '48px',
  wordmark: '(max-width: 639px) 80px, 132px',
  full: '(max-width: 639px) 140px, 160px',
};

export function BrandLogo({
  variant = 'wordmark',
  className = '',
  priority = false,
  decorative = false,
  sizes,
}: {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
  sizes?: string;
}) {
  const logo = LOGOS[variant];

  return (
    <Image
      src={logo.src}
      alt={decorative ? '' : `شعار ${SITE_NAME}`}
      width={logo.width}
      height={logo.height}
      sizes={sizes || LOGO_SIZES[variant]}
      className={`object-contain ${className}`}
      priority={priority}
    />
  );
}
