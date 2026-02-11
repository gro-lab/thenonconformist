const selectors = {
  gallerySelector: '#gallery-selector',
  galleryContent: '#gallery-content',
  infiniteCanvas: '#infinite-canvas',
  transformContainer: '#canvas-transform-container',
  masonryGrid: '#masonry-grid',
  modal: '#modal',
  modalImg: '#modal-img',
  likeBtn: '#like-btn',
  likeCount: '#like-count',
  backButton: '#back-button',
  cookieBanner: '#cookie-banner',
  cookieModal: '#cookie-settings-modal',
  cookieFloatBtn: '#cookie-float-btn',
  termsModal: '#terms-modal',
  termsLink: '#terms-link',
  loadingIndicator: '#loading-indicator',
  siteIntro: '.site-intro',
  termsFooter: '.terms-footer',
  galleryCovers: '.gallery-cover',
};
const cache = new Map();

export const dom = new Proxy(selectors, {
  get(target, key) {
    if (typeof key === 'symbol' || !(key in target)) return undefined;
    const cached = cache.get(key);
    if (cached?.isConnected) return cached;
    const el = document.querySelector(target[key]);
    if (el) cache.set(key, el);
    return el;
  }
});

export function clearDomCache(...keys) {
  keys.length ? keys.forEach(k => cache.delete(k)) : cache.clear();
}