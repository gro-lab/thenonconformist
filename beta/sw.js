// Service Worker for The Nonconformist
// Caches images aggressively for faster loading
// Cache is automatically invalidated when images.json changes

const CACHE_NAME = 'nonconformist-images';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const MANIFEST_URL = 'https://raw.githubusercontent.com/gro-lab/thenonconformist/main/images.json';
const MANIFEST_TIMESTAMP_KEY = 'nonconformist-manifest-last-modified';

// Install event - setup cache
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

// Activate event - cleanup old caches, then check if images.json changed
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            console.log('Deleting old cache:', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
            .then(() => checkManifestAndInvalidate())
    );
});

// Check images.json Last-Modified header.
// If it has changed since the last activation, wipe the image cache
// so users get fresh thumbnails and full-size images on next load.
async function checkManifestAndInvalidate() {
    try {
        const response = await fetch(MANIFEST_URL, {
            method: 'HEAD',
            cache: 'no-cache'
        });

        if (!response.ok) return;

        const lastModified = response.headers.get('last-modified') || response.headers.get('etag') || '';
        if (!lastModified) return;

        const stored = await getStoredManifestTimestamp();

        if (stored && stored !== lastModified) {
            console.log('images.json changed — clearing image cache');
            await caches.delete(CACHE_NAME);
        }

        await storeManifestTimestamp(lastModified);
    } catch (err) {
        // Network unavailable — leave cache intact
        console.log('Manifest check skipped (offline):', err.message);
    }
}

// Store the manifest timestamp in a tiny dedicated cache entry
async function getStoredManifestTimestamp() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(MANIFEST_TIMESTAMP_KEY);
        if (!response) return null;
        return await response.text();
    } catch {
        return null;
    }
}

async function storeManifestTimestamp(value) {
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(
            MANIFEST_TIMESTAMP_KEY,
            new Response(value, { headers: { 'Content-Type': 'text/plain' } })
        );
    } catch {
        // Non-fatal
    }
}

// Fetch event - cache strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only cache images from GitHub
    if (url.hostname === 'raw.githubusercontent.com' &&
        (url.pathname.endsWith('.jpg') ||
         url.pathname.endsWith('.jpeg') ||
         url.pathname.endsWith('.png') ||
         url.pathname.endsWith('.webp') ||
         url.pathname.endsWith('.JPEG') ||
         url.pathname.endsWith('.PNG'))) {

        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(request).then((cachedResponse) => {
                    // Check if cached response exists and is fresh
                    if (cachedResponse) {
                        const cachedDate = new Date(cachedResponse.headers.get('date'));
                        const now = new Date();

                        // Return cached if less than 7 days old
                        if (now - cachedDate < CACHE_EXPIRY) {
                            console.log('Serving from cache:', url.pathname);
                            return cachedResponse;
                        }
                    }

                    // Fetch from network
                    return fetch(request).then((response) => {
                        // Cache successful responses only
                        if (response && response.status === 200) {
                            console.log('Caching new image:', url.pathname);
                            cache.put(request, response.clone());
                        }
                        return response;
                    }).catch((error) => {
                        console.error('Fetch failed:', error);
                        // Return cached even if stale
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        throw error;
                    });
                });
            })
        );
    }
    // For non-image requests, just fetch normally
    else {
        event.respondWith(fetch(request));
    }
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
