import type { ReactNode } from 'react';
import { AuthenticatedMarketplaceShell } from '@/components/marketplace/authenticated-marketplace-shell';

export default function CustomerChatLayout({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedMarketplaceShell role="customer" displayName="مساحة العميل">
      {children}
    </AuthenticatedMarketplaceShell>
  );
}

