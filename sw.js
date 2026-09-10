const CACHE_NAME = 'giannexpress-v3';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/main.js',
  './js/supabaseClient.js',
  './manifest.json',
  './brand/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Un recurso "de código" (documento, hoja de estilo o script) tiene que
// reflejar el último despliegue de inmediato. Servirlo desde caché primero
// hacía que un cambio recién publicado no se viera hasta la segunda visita.
function esCodigo(request) {
  return request.mode === 'navigate' ||
    ['document', 'style', 'script'].includes(request.destination);
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Supabase siempre en vivo: precios y stock no se cachean.
  if (url.origin.includes('supabase.co')) return;

  // El panel admin queda fuera del service worker. Es una herramienta de
  // gestión que se registra desde la raíz sin pedirlo, y una versión
  // cacheada ahí genera bugs difíciles de diagnosticar.
  if (url.origin === self.location.origin && url.pathname.includes('/admin')) return;

  if (esCodigo(event.request)) {
    // Red primero, caché sólo como respaldo si no hay conexión.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Imágenes, íconos y fuentes: caché primero, que quedarse desactualizado
  // ahí no rompe nada y ahorra datos.
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
