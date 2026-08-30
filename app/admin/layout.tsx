import type { Metadata } from 'next';
import { requireProfile } from '@/lib/auth/guards';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireProfile(['admin']);
  return children;
}
