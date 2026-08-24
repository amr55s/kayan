import type { Metadata } from 'next';
import { DirectoryView } from '@/components/directory/DirectoryView';
import { fetchHomePageData } from '@/lib/supabase/queries';

export const revalidate = 60;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: 'ديرتك | الأماكن والخدمات والمتجر المحلي',
  description: 'اكتشف الأماكن والخدمات وكباتن التوصيل، وادخل متجر ديرتك للشراء من المتاجر المحلية داخل نفس الموقع.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'ديرتك | كل ما تحتاجه في مكان واحد',
    description: 'دليل الأماكن والخدمات والمتجر المحلي من داخل ديرتك.',
    url: '/',
    type: 'website',
  },
};

export default async function HomePage() {
  const { places, drivers, directoryError, renderedAt } = await fetchHomePageData();

  return (
    <DirectoryView
      initialPlaces={places}
      initialDrivers={drivers}
      directoryError={directoryError}
      renderedAt={renderedAt}
    />
  );
}
