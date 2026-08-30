import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireProfile } from '@/lib/auth/guards';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DriverLayout({ children }: { children: ReactNode }) {
  await requireProfile(['driver']);
  return children;
}
