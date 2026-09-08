const CACHE_VERSION = 'v3';
const CACHE_NAME = `escaner-${CACHE_VERSION}`;

// Todo lo necesario para arrancar sin internet. El catálogo en sí vive en
// IndexedDB (lo guarda index.html), esto solo cachea el "shell" de la app.
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './products.json',
    './vendor/tailwind.js',
    './vendor/xlsx.full.min.js',
    './vendor/html5-qrcode.min.js',
    './vendor/fonts.css',
    './vendor/fonts/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2',
    './vendor/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2',
    './vendor/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // addAll falla en bloque si un solo asset falla; se cachea uno a uno.
            Promise.all(ASSETS_TO_CACHE.map((url) =>
                cache.add(url).catch((err) => console.warn('No se pudo cachear', url, err))
            ))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// Cache primero: la app debe abrir igual de rápido con o sin red.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
