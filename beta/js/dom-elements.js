// ============================================
// DOM ELEMENTS — Proxy-based lazy cache
// Replaces scattered document.getElementById / querySelector calls.
// Auto-revalidates via .isConnected check.
//
// Usage:
//   import { dom } from '../dom-elements.js';
//   dom.galleryContent  // cached querySelector('#gallery-content')
// ============================================

const selectors = {
  // Gallery selector view
  gallerySelector:    '#gallery-selector',
  loadingIndicator:   '#loading-indicator',

  // Gallery content view
  galleryContent:     '#gallery-content',
  infiniteCanvas:     '#infinite-canvas',
  canvasContainer:    '#canvas-transform-container',
  masonryGrid:        '#masonry-grid',
  backButton:         '#back-button',
  galleryTitle:       '#current-gallery-title',
  gallerySubtitle:    '#current-gallery-subtitle',

  // Image modal
  modal:              '#modal',
  modalImg:           '#modal-img',
  modalClose:         '#modal-close',
  modalPrev:          '#modal-prev',
  modalNext:          '#modal-next',
  likeBtn:            '#like-btn',
  likeCount:          '#like-count',

  // Terms modal
  termsModal:         '#terms-modal',
  termsLink:          '#terms-link',
  termsModalClose:    '#terms-modal-close',

  // Cookie banner
  cookieBanner:       '#cookie-banner',
  cookieAcceptBtn:    '#cookie-accept-btn',
  cookieRejectBtn:    '#cookie-reject-btn',
  cookieSettingsBtn:  '#cookie-settings-btn',

  // Cookie settings modal
  cookieSettingsModal: '#cookie-settings-modal',
  cookieModalClose:   '#cookie-modal-close',
  cookieSaveBtn:      '#cookie-save-btn',
  cookieAcceptAllBtn: '#cookie-accept-all-btn',
  cookieRejectAllBtn: '#cookie-reject-all-btn',
  functionalCheckbox: '#functional-cookies',

  // Cookie floating button
  cookieFloatBtn:     '#cookie-float-btn',

  // Error toast
  errorContainer:     '#error-container',
};

const cache = new Map();

/**
 * Proxy-based DOM cache.
 * - Lazily queries the DOM on first access.
 * - Caches the result for subsequent accesses.
 * - Automatically re-queries if the cached element is detached.
 */
export const dom = new Proxy(selectors, {
  get(target, key) {
    if (typeof key === 'symbol' || !(key in target)) return undefined;

    const cached = cache.get(key);
    if (cached?.isConnected) return cached;

    const el = document.querySelector(target[key]);
    if (el) cache.set(key, el);
    return el;
  },
});

/**
 * Clear cached DOM references.
 * Call with no args to flush everything, or pass specific keys.
 */
export function clearDomCache(...keys) {
  if (keys.length) {
    keys.forEach((k) => cache.delete(k));
  } else {
    cache.clear();
  }
}
