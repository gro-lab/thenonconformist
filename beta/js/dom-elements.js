// ============================================
// DOM ELEMENTS — Centralized Proxy-based DOM cache
// Lazy queries, auto-detects stale references via .isConnected
// ============================================

/**
 * Map of logical names → CSS selectors.
 * Every module uses `dom.galleryContent` instead of raw document.querySelector().
 */
const selectors = {
  // Gallery selector
  gallerySelector:    '#gallery-selector',

  // Gallery content view
  galleryContent:     '#gallery-content',
  galleryTitle:       '#current-gallery-title',
  gallerySubtitle:    '#current-gallery-subtitle',
  masonryGrid:        '#masonry-grid',
  infiniteCanvas:     '#infinite-canvas',
  canvasContainer:    '#canvas-transform-container',
  backButton:         '#back-button',
  loadingIndicator:   '#loading-indicator',

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
 *
 * - Lazily queries the DOM on first access.
 * - Caches the result for subsequent accesses.
 * - Automatically re-queries if the cached element is detached (.isConnected === false).
 *
 * Usage:
 *   import { dom } from './dom-elements.js';
 *   dom.galleryContent  // returns the element, cached
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
 * Useful after innerHTML replacements or SPA route transitions.
 */
export function clearDomCache(...keys) {
  if (keys.length) {
    keys.forEach((k) => cache.delete(k));
  } else {
    cache.clear();
  }
}
