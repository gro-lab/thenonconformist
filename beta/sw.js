// Service Worker for The Nonconformist
// Cache-first strategy for images and manifest for fast gallery loading

const CACHE_NAME = 'nonconformist-v2';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

// Install event - setup cache
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

/**
 * Determine if a request should be handled by the cache-first strategy.
 * Covers: gallery images, thumbnails, and the manifest.
 */
function isCacheableRequest(url) {
    // Images from GitHub (full-size and thumbnails)
    if (url.hostname === 'raw.githubusercontent.com') {
        const path = url.pathname.toLowerCase();
        if (path.endsWith('.jpg') || path.endsWith('.jpeg') ||
            path.endsWith('.png') || path.endsWith('.webp')) {
            return true;
        }
        // Also cache the images.json manifest
        if (path.endsWith('/images.json')) {
            return true;
        }
    }
    return false;
}

// Fetch event - cache-first strategy for images and manifest
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (!isCacheableRequest(url)) {
        // Non-cacheable: just fetch normally
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(request).then((cachedResponse) => {
                // Check if cached response exists and is fresh
                if (cachedResponse) {
                    const cachedDate = new Date(cachedResponse.headers.get('date'));
                    const now = new Date();

                    // Return cached if less than 7 days old
                    if (now - cachedDate < CACHE_EXPIRY) {
                        return cachedResponse;
                    }
                }

                // Fetch from network
                return fetch(request).then((response) => {
                    // Cache successful responses only
                    if (response && response.status === 200) {
                        cache.put(request, response.clone());
                    }
                    return response;
                }).catch((error) => {
                    console.error('Fetch failed:', error);
                    // Return stale cached response as fallback
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    throw error;
                });
            });
        })
    );
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'clearCache') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('Cache cleared');
                return self.clients.matchAll();
            }).then((clients) => {
                clients.forEach(client => client.postMessage({
                    action: 'cacheCleared'
                }));
            })
        );
    }
});