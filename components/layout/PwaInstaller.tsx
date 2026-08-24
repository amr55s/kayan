'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const INSTALL_ROUTES = new Set(['/', '/driver', '/guide', '/share']);
const PwaInstallExperience = dynamic(
  () => import('./PwaInstallExperience').then((module) => module.PwaInstallExperience),
  { ssr: false },
);

export function PwaInstaller() {
  const pathname = usePathname();

  // The installer is useful on the public entry routes only. Keeping its modal,
  // icon, and service-worker runtime out of commerce and auth routes avoids
  // hydrating an invisible interface during their critical render.
  if (!INSTALL_ROUTES.has(pathname)) return null;
  return <PwaInstallExperience />;
}
