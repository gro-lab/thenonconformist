// js/app.js - Entry point
import { store } from './lib/store.js';
import { bus } from './lib/event-bus.js';
import { errorHandler } from './lib/error-handler.js';
import { initDomCache } from './dom-elements.js';
import { initCookieConsent } from './modules/cookies.js';
// firebase.js is now loaded dynamically — only when consent is given
import { initNavigation } from './modules/navigation.js';
import { initGallery } from './modules/gallery.js';
import { initModal } from './modules/modal.js';

// Register Service Worker for cache-first image loading (no consent needed — technical necessity)
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('✅ Service Worker registered:', reg.scope))
        .catch(err => console.warn('⚠️ Service Worker registration failed:', err));
    });
  }
}

async function init() {
  try {
    console.log('🚀 Initializing The Nonconformist (modular)...');
    
    // 0. Register Service Worker early (cache-first for images)
    registerServiceWorker();
    
    // 1. Set up global error handling first
    errorHandler.setupGlobalHandlers();
    
    // 2. Initialize DOM cache (Proxy-based)
    initDomCache();
    
    // 3. Load persisted cookie preferences and init cookie module
    await initCookieConsent();
    
    // 4. If functional cookies allowed, dynamically load and init Firebase
    //    This avoids pulling in ~139KB of Firebase SDK when consent is not given,
    //    and removes firebase.js from the critical request chain entirely.
    if (store.get('functionalCookiesEnabled')) {
      const { initFirebase } = await import('./modules/firebase.js');
      await initFirebase();
    }
    
    // 4b. Handle late consent — if user accepts cookies after page load,
    //     dynamically load firebase.js so its bus listeners get registered.
    //     Once loaded, firebase.js's own consent:updated handler takes over.
    let firebaseLoaded = store.get('functionalCookiesEnabled');
    if (!firebaseLoaded) {
      const unsub = bus.on('consent:updated', async (prefs) => {
        if (prefs.functional && !firebaseLoaded) {
          firebaseLoaded = true;
          unsub(); // only need to bootstrap once
          // Dynamic import registers firebase.js's own bus listeners,
          // then we forward this consent event so it runs initFirebase()
          await import('./modules/firebase.js');
          bus.emit('consent:updated', prefs);
        }
      });
    }
    
    // 5. Initialize navigation (History API / FSM) — must be before gallery
    initNavigation();
    
    // 6. Initialize gallery (depends on Firebase data if enabled)
    await initGallery();
    
    // 7. Initialize modal (lightbox)
    initModal();
    
    console.log('✅ All modules initialized');
  } catch (error) {
    errorHandler.handle(error, { module: 'app' });
  }
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}