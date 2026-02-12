// js/dom-elements.js
const selectors = {
    // Gallery selector page
    gallerySelector: '#gallery-selector',
    siteIntro: '.site-intro',
    termsFooter: '.terms-footer',

    // Gallery view
    galleryContent: '#gallery-content',
    masonryGrid: '#masonry-grid',
    canvasTransform: '#canvas-transform-container',
    infiniteCanvas: '#infinite-canvas',
    backButton: '#back-button',
    currentGalleryTitle: '#current-gallery-title',
    currentGallerySubtitle: '#current-gallery-subtitle',
    loadingIndicator: '#loading-indicator',

    // Modals
    modal: '#modal',
    modalImg: '#modal-img',
    modalClose: '#modal-close',
    modalPrev: '#modal-prev',
    modalNext: '#modal-next',
    likeBtn: '#like-btn',
    likeCount: '#like-count',
    heart: '.heart',

    // Terms modal
    termsModal: '#terms-modal',
    termsLink: '#terms-link',
    termsModalClose: '#terms-modal-close',

    // Cookie UI
    cookieBanner: '#cookie-banner',
    cookieSettingsModal: '#cookie-settings-modal',
    cookieFloatBtn: '#cookie-float-btn',
    functionalCheckbox: '#functional-cookies',

    // Gallery covers & counts
    coverLow: '.gallery-cover[data-gallery="low"]',
    coverSol: '.gallery-cover[data-gallery="sol"]',
    coverR: '.gallery-cover[data-gallery="r"]',
    coverSa: '.gallery-cover[data-gallery="sa"]',
    countLow: '#low-count',
    countSol: '#sol-count',
    countR: '#r-count',
    countSa: '#sa-count',

    // Utility
    errorToast: '#error-toast'  // you may add this element if not present
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
    if (keys.length === 0) cache.clear();
    else keys.forEach(k => cache.delete(k));
}