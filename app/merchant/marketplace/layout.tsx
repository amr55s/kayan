import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MerchantMarketplaceShell } from '@/components/marketplace/merchant/merchant-marketplace-shell';
import { requireProfile } from '@/lib/auth/guards';
import { ChatInboxNavigation } from '@/components/marketplace/chat/chat-inbox-navigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'إدارة المنتجات | ديرتك',
  description: 'إدارة منتجات المتجر والمتغيرات والمخزون والصور وملفات Excel.',
};

export default async function MerchantMarketplaceLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile(['merchant']);
  return (
    <MerchantMarketplaceShell displayName={profile.display_name}>
      <ChatInboxNavigation role="merchant" />
      {children}
    </MerchantMarketplaceShell>
  );
}
