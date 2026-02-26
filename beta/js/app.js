// js/app.js - Entry point
import { store } from './lib/store.js';
import { errorHandler } from './lib/error-handler.js';
import { initDomCache } from './dom-elements.js';
import { initCookieConsent } from './modules/cookies.js';
import { initFirebase } from './modules/firebase.js';
import { initNavigation } from './modules/navigation.js';   // ⬅️ moved up
import { initGallery } from './modules/gallery.js';
import { initModal } from './modules/modal.js';
import { initAudio } from './modules/audio.js';

async function init() {
  try {
    console.log('🚀 Initializing The Nonconformist (modular)...');
    
    // 1. Set up global error handling first
    errorHandler.setupGlobalHandlers();
    
    // 2. Initialize DOM cache (Proxy-based)
    initDomCache();
    
    // 3. Load persisted cookie preferences and init cookie module
    await initCookieConsent();
    
    // 4. If functional cookies allowed, init Firebase
    if (store.get('functionalCookiesEnabled')) {
      await initFirebase();
    }
    
    // 5. Initialize navigation (History API / FSM) – must be before gallery
    initNavigation();
    
    // 6. Initialize gallery (depends on Firebase data if enabled)
    await initGallery();
    
    // 7. Initialize modal (lightbox)
    initModal();
    
    // 8. Initialize audio synesthesia (ambient soundscapes)
    initAudio();
    
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