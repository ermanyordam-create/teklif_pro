/* ═══════════════════════════════════════════════════════════
   TeklifPro Service Worker
   Versiyon: 1.0.0
   Strateji: Cache-First (offline öncelikli)
═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'teklifpro-v1';
const CACHE_STATIC = 'teklifpro-static-v1';
const CACHE_CDN    = 'teklifpro-cdn-v1';

/* Yerel dosyalar — her zaman cache'le */
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

/* CDN kütüphaneleri — ilk yüklemede cache'le, sonra offline çalış */
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

/* ─── INSTALL: Statik dosyaları cache'e al ─── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Statik dosyalar cache\'leniyor…');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

/* ─── ACTIVATE: Eski cache'leri temizle ─── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_CDN)
          .map(key => {
            console.log('[SW] Eski cache siliniyor:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/* ─── FETCH: İstekleri yönet ─── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Sadece GET isteklerini yönet */
  if (event.request.method !== 'GET') return;

  /* Google Fonts font dosyaları (woff2 vb.) */
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request, CACHE_CDN));
    return;
  }

  /* CDN kaynakları */
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(event.request, CACHE_CDN));
    return;
  }

  /* Yerel dosyalar */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, CACHE_STATIC));
    return;
  }
});

/* ─── Cache-First stratejisi ─── */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    /* Cache'de var → cache'den döndür, arka planda güncelle */
    refreshCache(request, cache);
    return cached;
  }

  /* Cache'de yok → ağdan al ve cache'e ekle */
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    /* Ağ yok ve cache'de yok → offline fallback */
    console.warn('[SW] Offline, kaynak bulunamadı:', request.url);
    return new Response(
      '<html><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>⚡ TeklifPro</h2><p>İnternet bağlantısı yok. Uygulama yüklenirken bekleniyor…</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/* ─── Arka planda cache yenileme (Stale-While-Revalidate) ─── */
async function refreshCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch {
    /* Offline — önemli değil, cache zaten var */
  }
}

/* ─── Mesaj dinle (örn: "skipWaiting" komutu) ─── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
