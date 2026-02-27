// js/dom-elements.js
// Proxy-based DOM cache with automatic stale reference detection

const selectors = {
  // Main containers
  gallerySelector: '#gallery-selector',
  galleryContent: '#gallery-content',
  modal: '#modal',
  termsModal: '#terms-modal',
  cookieBanner: '#cookie-banner',
  cookieModal: '#cookie-settings-modal',
  cookieModalClose: '#cookie-modal-close',
  cookieFloatBtn: '#cookie-float-btn',
  loadingIndicator: '#loading-indicator',
  masonryGrid: '#masonry-grid',
  infiniteCanvas: '#infinite-canvas',
  canvasTransformContainer: '#canvas-transform-container',
  backButton: '#back-button',
  galleryHeader: '#gallery-header',
  currentGalleryTitle: '#current-gallery-title',
  currentGallerySubtitle: '#current-gallery-subtitle',
  modalImg: '#modal-img',
  likeBtn: '#like-btn',
  likeCount: '#like-count',
  modalPrev: '#modal-prev',
  modalNext: '#modal-next',
  modalClose: '#modal-close',
  termsLink: '#terms-link',
  termsModalClose: '#terms-modal-close',
  cookieUi: '#cookie-ui',
  cookieModalUi: '#cookie-modal-ui',
  functionalCheckbox: '#functional-cookies',
  audioToggle: '#audio-toggle',
  lowCount: '#low-count',
  solCount: '#sol-count',
  rCount: '#r-count',
  saCount: '#sa-count',
  
  // Presence indicators
  presenceGallery: '#presence-gallery',
  presenceImage: '#presence-image',
};

const cache = new Map();

export const dom = new Proxy(selectors, {
  get(target, key) {
    if (typeof key === 'symbol' || !(key in target)) return undefined;
    
    // Check cache first
    const cached = cache.get(key);
    if (cached && cached.isConnected) {
      return cached; // still in DOM, use it
    }
    
    // Not cached or stale, query fresh
    const selector = target[key];
    const el = document.querySelector(selector);
    if (el) {
      cache.set(key, el);
    }
    return el;
  }
});

export function clearDomCache(...keys) {
  if (keys.length === 0) {
    cache.clear();
  } else {
    keys.forEach(k => cache.delete(k));
  }
}

// Called on app init to warm up cache for essential elements
export function initDomCache() {
  // Just accessing them via dom will populate cache
  Object.keys(selectors).forEach(key => dom[key]);
}
