const CACHE_NAME = 'escaner-inventario-v1.1'; // Incrementamos versión para forzar actualización
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './sw.js'
];

// Librerías externas que deben manejarse con cuidado
const EXTERNAL_ASSETS = [
    'https://cdn.tailwindcss.com?plugins=forms,typography',
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cacheamos lo local primero
            cache.addAll(ASSETS_TO_CACHE);
            // Intentamos cachear lo externo de forma individual para que un fallo no rompa todo
            EXTERNAL_ASSETS.forEach(url => {
                fetch(new Request(url, { mode: 'no-cors' })).then(res => cache.put(url, res)).catch(() => {});
            });
        })
    );
    self.skipWaiting(); // Fuerza a la nueva versión a activarse de inmediato
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Estrategia: Cache First, pero si es un recurso externo intentamos red si falla caché
            return response || fetch(event.request).catch(() => {
                // Si falla el fetch (offline) y no hay caché, podrías retornar una página offline aquí
            });
        })
    );
});