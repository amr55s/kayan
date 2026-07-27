import { requireProfile } from '@/lib/auth/guards';

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireProfile(['admin']);
  return children;
}
