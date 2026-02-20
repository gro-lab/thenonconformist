// Service Worker for The Nonconformist
// Caches images aggressively for faster loading

const CACHE_NAME = 'nonconformist-v1';
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