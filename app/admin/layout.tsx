import type { Metadata } from 'next';
import { requireProfile } from '@/lib/auth/guards';
import { ChatInboxNavigation } from '@/components/marketplace/chat/chat-inbox-navigation';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireProfile(['admin']);
  return <><ChatInboxNavigation role="admin" />{children}</>;
}
