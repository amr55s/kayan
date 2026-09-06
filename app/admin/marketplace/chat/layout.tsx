import type { ReactNode } from 'react';
import { AuthenticatedMarketplaceShell } from '@/components/marketplace/authenticated-marketplace-shell';

export default function AdminChatLayout({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedMarketplaceShell role="admin" displayName="مراقبة المنصة">
      {children}
    </AuthenticatedMarketplaceShell>
  );
}
