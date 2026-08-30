import type { ReactNode } from 'react';
import { AuthenticatedMarketplaceShell } from '../authenticated-marketplace-shell';

export function MerchantMarketplaceShell({
  children,
  displayName,
}: {
  children: ReactNode;
  displayName: string;
}) {
  return (
    <AuthenticatedMarketplaceShell role="merchant" displayName={displayName}>
      {children}
    </AuthenticatedMarketplaceShell>
  );
}
