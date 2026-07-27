import type { Metadata, Viewport } from 'next';
import { SITE_NAME, SITE_NAME_AR, SITE_TAGLINE } from '@/lib/brand';
import { Providers } from './providers';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: `${SITE_NAME} | ${SITE_TAGLINE}`,
  description: `${SITE_NAME_AR} يجمع المحلات والمطاعم والصيدليات والخدمات والتوصيل والتواصل المباشر في مكان واحد`,
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
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
  return (
    <html lang="ar" dir="rtl" className="light" suppressHydrationWarning>
      <body
        className="min-h-screen bg-zinc-50 font-sans text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white"
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
