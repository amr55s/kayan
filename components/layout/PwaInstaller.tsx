'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import { Download, PlusSquare, RefreshCw, Share, Smartphone, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'kayan_pwa_dismissed_at';
const RELOAD_KEY = 'kayan_pwa_reloading';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1_000;
const INSTALL_ROUTES = new Set(['/', '/driver', '/guide', '/share']);
const UPDATE_CHECK_INTERVAL = 10 * 60 * 1_000;

function readDismissedRecently() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DURATION;
  } catch {
    return false;
  }
}

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

function isIosDevice() {
  const platform = navigator.platform || '';
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function PwaInstaller() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      ).catch(() => undefined);
      if ('caches' in window) {
        void window.caches.keys().then((keys) =>
          Promise.all(keys
            .filter((key) => key.startsWith('kayan-'))
            .map((key) => window.caches.delete(key))),
        ).catch(() => undefined);
      }
      return;
    }
    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;

    const markUpdateReady = () => {
      if (!disposed) {
        setUpdateReady(true);
        setShowBanner(true);
      }
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          markUpdateReady();
        }
      });
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        if (registration.waiting && navigator.serviceWorker.controller) markUpdateReady();
        watchInstallingWorker(registration.installing);
        registration.addEventListener('updatefound', () => {
          watchInstallingWorker(registration?.installing ?? null);
        });
        await registration.update().catch(() => undefined);
      } catch {
        // PWA support is optional; the web application remains fully usable.
      }
    };

    if (document.readyState === 'complete') {
      void register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    const reloadAfterUpdate = () => {
      try {
        if (window.sessionStorage.getItem(RELOAD_KEY) !== 'true') return;
        window.sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        // A reload is still safe after the user explicitly requested the update.
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reloadAfterUpdate);
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registration?.update().catch(() => undefined);
      }
    };
    const updateTimer = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL);
    window.addEventListener('pageshow', checkForUpdate);
    document.addEventListener('visibilitychange', checkForUpdate);

    return () => {
      disposed = true;
      window.clearInterval(updateTimer);
      window.removeEventListener('load', register);
      window.removeEventListener('pageshow', checkForUpdate);
      document.removeEventListener('visibilitychange', checkForUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', reloadAfterUpdate);
    };
  }, []);

  useEffect(() => {
    if (!INSTALL_ROUTES.has(pathname) || isStandalone() || readDismissedRecently()) {
      return;
    }

    const ios = isIosDevice();
    const showIosTimer = window.setTimeout(() => {
      setIsIos(ios);
      if (ios || updateReady) setShowBanner(true);
    }, updateReady ? 0 : ios ? 1_200 : 0);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    const handleInstalled = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      setInstalling(false);
      if ('storage' in navigator && typeof navigator.storage.persist === 'function') {
        void navigator.storage.persist().catch(() => false);
      }
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.clearTimeout(showIosTimer);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [pathname, updateReady]);

  async function handleInstall() {
    if (updateReady) {
      try {
        window.sessionStorage.setItem(RELOAD_KEY, 'true');
      } catch {
        // The update can still be activated without session storage.
      }
      const registration = await navigator.serviceWorker?.getRegistration('/');
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.setTimeout(() => window.location.reload(), 2_000);
      } else {
        window.location.reload();
      }
      return;
    }
    if (isIos) {
      setShowIosGuide(true);
      return;
    }
    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowBanner(false);
    } catch {
      // Keep the site usable if the browser withdraws the native prompt.
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // The banner still closes when storage is disabled.
    }
  }

  const canInstall = updateReady || isIos || Boolean(deferredPrompt);

  return (
    <>
      {(updateReady || INSTALL_ROUTES.has(pathname)) && showBanner && canInstall && (
        <aside
          aria-label={updateReady ? 'تحديث التطبيق متاح' : 'تثبيت التطبيق'}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[60] mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl border border-zinc-700 bg-zinc-950 p-3 text-white shadow-2xl sm:bottom-4"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900">
              {updateReady
                ? <RefreshCw className="size-4" aria-hidden="true" />
                : <Download className="size-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {updateReady ? 'تحديث جديد جاهز' : 'ثبّت KAYAN CITY SPOT'}
              </p>
              <p className="truncate text-[11px] text-zinc-400">
                {updateReady ? 'حدّث عندما تكون جاهزًا' : 'وصول أسرع وتجربة ملء الشاشة'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              onPress={handleInstall}
              isLoading={installing}
              className="min-h-9 bg-white px-3 text-xs font-extrabold text-zinc-950"
            >
              {updateReady ? 'تحديث' : 'تثبيت'}
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={handleDismiss}
              aria-label="إغلاق اقتراح تثبيت التطبيق"
              className="size-9 min-w-9 text-zinc-300"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </aside>
      )}

      <Modal
        isOpen={INSTALL_ROUTES.has(pathname) && showIosGuide}
        onOpenChange={setShowIosGuide}
        placement="bottom-center"
        size="sm"
        classNames={{
          base: 'dir-rtl mx-3 mb-[calc(.75rem+env(safe-area-inset-bottom))] rounded-[28px] border border-zinc-200 bg-white sm:mx-0 sm:mb-0',
          body: 'overscroll-contain pb-6',
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-3 border-b border-zinc-100">
            <span className="flex size-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
              <Smartphone className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-black">تثبيت التطبيق على iPhone</h2>
              <p className="mt-0.5 text-xs font-normal text-zinc-500">خطوتان من Safari</p>
            </div>
          </ModalHeader>
          <ModalBody className="gap-3 pt-4">
            <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <Share className="size-5 text-sky-600" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold leading-6">اضغط زر «مشاركة» في شريط Safari.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <PlusSquare className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold leading-6">اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</p>
            </div>
            <p className="text-xs leading-6 text-zinc-500">
              افتح KAYAN CITY SPOT بعد ذلك من الأيقونة ليعمل بواجهة مستقلة وملء الشاشة.
            </p>
            <Button
              onPress={() => setShowIosGuide(false)}
              className="min-h-11 bg-zinc-950 font-bold text-white"
            >
              فهمت
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
