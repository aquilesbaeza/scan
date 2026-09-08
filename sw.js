const CACHE_VERSION = 'v4';
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

// index.html y products.json cambian: red primero, cache como respaldo.
// Con cache-primero el dispositivo se quedaba con una version vieja de la app.
const SIEMPRE_FRESCO = /(\/|\.html|products\.json|manifest\.json)$/;

function guardar(request, response) {
    if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    const url = new URL(event.request.url);

    if (SIEMPRE_FRESCO.test(url.pathname)) {
        event.respondWith(
            fetch(event.request)
                .then((response) => guardar(event.request, response))
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // vendor/ y fuentes: cache primero, casi nunca cambian.
    event.respondWith(
        caches.match(event.request).then((cached) =>
            cached || fetch(event.request).then((response) => guardar(event.request, response))
        )
    );
});
