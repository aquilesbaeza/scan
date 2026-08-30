const CACHE_VERSION = 'v1';
const CACHE_NAME = `escaner-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/products.json',
    'https://cdn.tailwindcss.com',
    'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons'
];

// Instalar y cachear assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(() => {
                // Continuar si algún asset no está disponible
                return Promise.resolve();
            });
        })
    );
    self.skipWaiting();
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: primero online, sino cache
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Para products.json, intentar actualizar en background
    if (url.pathname.endsWith('products.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const cache = caches.open(CACHE_NAME);
                    cache.then((c) => c.put(event.request, response.clone()));
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Para el resto, caché primero, sino online
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then((response) => {
                const cache = caches.open(CACHE_NAME);
                cache.then((c) => c.put(event.request, response.clone()));
                return response;
            });
        })
    );
});

// Sincronización en background
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-inventory') {
        event.waitUntil(syncInventory());
    }
});

async function syncInventory() {
    try {
        const response = await fetch('/sync-info');
        const data = await response.json();
        // Notificar a los clientes
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_UPDATED',
                data: data
            });
        });
    } catch (error) {
        console.error('Sync failed:', error);
    }
}
