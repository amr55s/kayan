import type { Metadata, Viewport } from 'next';
import { SITE_NAME, SITE_NAME_AR, SITE_TAGLINE } from '@/lib/brand';
import { WhatsAppGroupButton } from '@/components/layout/WhatsAppGroupButton';
import { Providers } from './providers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClientErrorReporter } from '@/components/observability/ClientErrorReporter';
import { BehaviorAnalyticsReporter } from '@/components/observability/BehaviorAnalyticsReporter';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://kayan-hazel.vercel.app',
  ),
  title: `${SITE_NAME} | ${SITE_TAGLINE}`,
  description: `${SITE_NAME_AR} يجمع المحلات والمطاعم والصيدليات والخدمات والتوصيل والتواصل المباشر في مكان واحد`,
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const release = process.env.VERCEL_GIT_COMMIT_SHA || 'local';
  return (
    <html lang="ar" dir="rtl" className="light" suppressHydrationWarning>
      <body
        className="min-h-screen bg-zinc-50 font-sans text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white"
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="fixed start-3 top-3 z-[200] -translate-y-24 rounded-xl bg-zinc-950 px-4 py-3 font-bold text-white transition-transform focus:translate-y-0 motion-reduce:transition-none"
        >
          تخطَّ إلى المحتوى
        </a>
        <Providers>
          {children}
          <WhatsAppGroupButton />
        </Providers>
        <Analytics />
        <SpeedInsights />
        <ClientErrorReporter release={release} />
        <BehaviorAnalyticsReporter />
      </body>
    </html>
  );
}
