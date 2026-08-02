const CACHE_VERSION = 'dairtak-v1-brand';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const PUBLIC_PAGES = new Set(['/', '/guide', '/share']);
const PRIVATE_PREFIXES = ['/admin', '/driver', '/merchant', '/login'];
const SHELL_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/brand/dairtak-mark.png',
  '/brand/dairtak-wordmark.png',
  '/brand/dairtak-logo-full.png',
  '/brand/dairtak-mark.svg',
  '/brand/dairtak-wordmark.svg',
  '/brand/dairtak-logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => (
              key.startsWith('kayan-') || key.startsWith('dairtak-')
            ) && !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isNextDataRequest(request, url) {
  return request.headers.get('RSC') === '1'
    || request.headers.has('Next-Router-State-Tree')
    || url.searchParams.has('_rsc');
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGE_CACHE);
  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(cacheKey))
      || (await caches.match('/offline.html'))
      || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > 80) await cache.delete(keys[0]);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/')
    || isPrivatePath(url.pathname)
    || isNextDataRequest(request, url)
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    if (PUBLIC_PAGES.has(url.pathname)) {
      event.respondWith(networkFirstPage(request, url));
    } else {
      event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    }
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/icons/')
    || request.destination === 'image'
    || request.destination === 'font'
    || request.destination === 'style'
    || request.destination === 'script'
  ) {
    event.respondWith(cacheFirstAsset(request));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || 'لديك تحديث جديد.' };
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'DAIRTAK', {
    body: payload.body || 'لديك تحديث جديد.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/driver' },
    tag: payload.tag || 'kayan-update',
    renotify: Boolean(payload.renotify),
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/driver', self.location.origin).toString();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if ('focus' in client && new URL(client.url).origin === self.location.origin) {
          if ('navigate' in client) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
