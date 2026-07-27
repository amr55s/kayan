'use client';

import { HeroUIProvider } from '@heroui/react';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <HeroUIProvider className="flex min-h-screen flex-col bg-zinc-50 text-zinc-950 antialiased">
      {children}
    </HeroUIProvider>
  );
}
