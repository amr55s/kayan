import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ChatInboxNavigation } from '@/components/marketplace/chat/chat-inbox-navigation';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MerchantLayout({ children }: { children: ReactNode }) {
  return <><ChatInboxNavigation role="merchant" />{children}</>;
}
