// ============================================
// APP.JS — Entry point / Orchestrator
// Single DOMContentLoaded, clear initialization order.
// Cross-module wiring via event bus.
// ============================================

import { store } from './lib/store.js';
import { bus } from './lib/event-bus.js';
import './lib/error-handler.js'; // Self-initializing — installs global handlers

// Modules
import { initFirebase, fetchAllLikes } from './modules/firebase.js';
import {
  initGallery,
  loadManifest,
  setupGallerySelector,
  setupCanvasNavigation,
  openGallery,
  closeGalleryDirect,
  reloadCurrentGallery,
} from './modules/gallery.js';
import { initModal, closeModalDirect } from './modules/modal.js';
import { initCookieBanner, initCookieListeners } from './modules/cookies.js';
import { initNavigation } from './modules/navigation.js';

// ── Wire cross-module events via bus ─────────

bus.on('gallery:open', ({ galleryId }) => openGallery(galleryId));
bus.on('gallery:reload', () => reloadCurrentGallery());
bus.on('gallery:close', () => closeGalleryDirect());
bus.on('modal:close', () => closeModalDirect());

// ── Bootstrap ────────────────────────────────

async function init() {
  try {
    console.log('🚀 Initializing The Nonconformist…');

    // 1. Cookie consent (sync — reads localStorage & shows banner if needed)
    initCookieBanner();

    // 2. Load image manifest
    await loadManifest();

    // 3. If functional cookies already accepted, init Firebase + fetch likes
    if (store.get('functionalCookiesEnabled')) {
      try {
        await initFirebase();
        await fetchAllLikes();
      } catch (err) {
        console.warn('⚠️ Firebase init skipped:', err.message);
      }
    }

    // 4. Setup gallery selector (cover images, counts)
    await setupGallerySelector();

    // 5. Init all module listeners
    initGallery();
    initModal();
    initCookieListeners();
    initNavigation();

    // 6. Hide loading indicator
    const loading = document.getElementById('loading-indicator');
    if (loading) {
      loading.classList.remove('active');
      setTimeout(() => { loading.style.display = 'none'; }, 800);
    }

    console.log('✅ The Nonconformist initialized successfully');
  } catch (error) {
    console.error('❌ Initialization error:', error);

    // Hide loading indicator on error too
    const loading = document.getElementById('loading-indicator');
    if (loading) {
      loading.classList.remove('active');
      loading.style.display = 'none';
    }
  }
}

// ── Start ────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}