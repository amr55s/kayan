import type { ReactNode } from 'react';
import { AuthenticatedMarketplaceShell } from '@/components/marketplace/authenticated-marketplace-shell';

export default function DriverChatLayout({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedMarketplaceShell role="driver" displayName="مساحة الكابتن">
      {children}
    </AuthenticatedMarketplaceShell>
  );
}
