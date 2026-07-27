import React, { Suspense } from 'react';
import { fetchHomePageData } from '@/lib/supabase/queries';
import { DirectoryView } from '@/components/directory/DirectoryView';
import Loading from './loading';

export const revalidate = 60;

export default async function HomePage() {
  const { places, drivers, directoryError } = await fetchHomePageData();

  return (
    <Suspense fallback={<Loading />}>
      <DirectoryView
        initialPlaces={places}
        initialDrivers={drivers}
        directoryError={directoryError}
      />
    </Suspense>
  );
}
