'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PwaInstaller: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // The application remains usable when PWA registration is unavailable.
      });
    }
    let dismissed: string | null = null;
    try {
      dismissed = window.localStorage.getItem('kayan_pwa_dismissed');
    } catch {
      // Storage can be disabled by privacy settings; installation stays optional.
    }
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
    } catch {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      window.localStorage.setItem('kayan_pwa_dismissed', 'true');
    } catch {
      // The banner still closes when persistent storage is unavailable.
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-white shadow-xl sm:bottom-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0 border border-zinc-700">
          <Download className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">ثبّت التطبيق</p>
          <p className="text-[11px] text-zinc-400 truncate">وصول أسرع بدون متصفح</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          onClick={handleInstall}
          className="font-extrabold text-xs bg-white text-zinc-950 hover:bg-zinc-100 h-8 rounded-xl px-3.5 shadow-sm"
        >
          تثبيت
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onClick={handleDismiss}
          aria-label="إغلاق اقتراح تثبيت التطبيق"
          className="text-zinc-400 min-w-7 w-7 h-7"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
