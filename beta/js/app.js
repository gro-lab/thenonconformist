// ============================================
// APP.JS — Entry point / Orchestrator
// Single DOMContentLoaded, clear initialization order
// ============================================

import { store } from './store.js';
import { bus } from './event-bus.js';
import './error-handler.js'; // Self-initializing — installs global handlers

// Modules
import { initFirebase, fetchAllLikes } from './firebase.js';
import {
  initGallery,
  loadManifest,
  setupGallerySelector,
  setupCanvasNavigation,
  setupBackButton,
  openGallery,
  reloadCurrentGallery,
} from './gallery.js';
import { initModal } from './modal.js';
import { initCookieBanner, initCookieListeners } from './cookies.js';
import { initNavigation } from './navigation.js';

// ── Wire cross-module events via bus ─────────

bus.on('gallery:open', ({ galleryId }) => openGallery(galleryId));
bus.on('gallery:reload', () => reloadCurrentGallery());

// ── Bootstrap ────────────────────────────────

async function init() {
  try {
    console.log('🚀 Initializing The Nonconformist…');

    // 1. Cookie consent (sync — just reads localStorage & shows banner)
    initCookieBanner();

    // 2. Load image manifest
    await loadManifest();

    // 3. Firebase — only if user consented
    if (store.get('functionalCookiesEnabled')) {
      console.log('🔑 Functional cookies enabled → initializing Firebase…');
      await initFirebase();
      await fetchAllLikes();
    } else {
      console.log('🔑 Functional cookies not enabled → default likes (0)');
    }

    // 4. Initialize all modules (registers listeners via AbortController)
    initGallery();
    initModal();
    initCookieListeners();

    // 5. Build gallery selector UI
    await setupGallerySelector();

    // 6. Canvas drag/wheel/keyboard
    setupCanvasNavigation();
    setupBackButton();

    // 7. History API navigation + Terms modal
    initNavigation();

    console.log('✅ Initialization complete');
  } catch (error) {
    console.error('❌ Init error:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
