// js/modules/modal.js
// Modal lightbox with navigation and like functionality
// — full-size images served from the shared ImageCache; neighbours prefetched.
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';
import { getDocIdFromUrl } from '../lib/utils.js';
import { imageCache } from '../lib/image-cache.js';

let currentAbortController = null;

// ─────────────────────────────────────────────────────────────────────────────
// CACHE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets the modal <img> src from cache, with a loading class while the blob
 * is being fetched on a cache miss.
 * @param {string} url  Full-size image URL.
 */
const applyImageFromCache = (url) => {
  if (!dom.modalImg) return;

  // Synchronous hit — apply instantly, no flicker
  if (imageCache.has(url)) {
    dom.modalImg.src = imageCache.get(url);
    dom.modalImg.classList.remove('modal-img--loading');
    return;
  }

  // Cache miss — show loading state, fetch in background
  dom.modalImg.src = '';
  dom.modalImg.classList.add('modal-img--loading');

  imageCache.load(url).then(resolvedUrl => {
    // Only apply if this is still the current photo (user may have navigated)
    if (store.get('currentPhoto') === url) {
      dom.modalImg.src = resolvedUrl;
      dom.modalImg.classList.remove('modal-img--loading');
    }
  });
};

/**
 * Silently prefetches the full-size URLs of adjacent images into the cache
 * so that prev/next navigation feels instant.
 * @param {number} currentIndex
 */
const prefetchNeighbours = (currentIndex) => {
  const images = store.get('currentGalleryImages') || [];
  if (images.length <= 1) return;

  const indices = [
    (currentIndex + 1) % images.length,                   // next
    (currentIndex - 1 + images.length) % images.length    // prev
  ];

  indices.forEach(i => {
    const url = images[i]?.url;
    if (url && !imageCache.has(url)) {
      // Fire-and-forget — result goes into the shared cache automatically
      imageCache.load(url).catch(() => { /* ignore prefetch failures */ });
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// LIKE BUTTON
// ─────────────────────────────────────────────────────────────────────────────

const updateLikeButton = () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;

  const likesCache = store.get('likesCache') || {};
  const docId = getDocIdFromUrl(currentPhoto);
  const likes = likesCache[docId] || 0;
  const likeCountEl = dom.likeCount;
  const heartEl = dom.likeBtn?.querySelector('.heart');

  if (likeCountEl) likeCountEl.textContent = likes;

  let isLiked = false;
  if (store.get('functionalCookiesEnabled')) {
    isLiked = localStorage.getItem(`liked_${docId}`) === 'true';
  }

  if (heartEl) {
    heartEl.textContent = isLiked ? '♥' : '♡';
    dom.likeBtn?.classList.toggle('liked', isLiked);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

const navigateModal = (direction) => {
  const currentIndex = store.get('currentPhotoIndex');
  const images = store.get('currentGalleryImages') || [];
  if (images.length === 0) return;

  const newIndex = direction === 'prev'
    ? (currentIndex - 1 + images.length) % images.length
    : (currentIndex + 1) % images.length;

  const nextImage = images[newIndex];
  store.set('currentPhoto', nextImage.url);
  store.set('currentPhotoIndex', newIndex);

  applyImageFromCache(nextImage.url);
  updateLikeButton();
  prefetchNeighbours(newIndex);
};

// ─────────────────────────────────────────────────────────────────────────────
// OPEN / CLOSE
// ─────────────────────────────────────────────────────────────────────────────

const openModal = ({ url, galleryId, index }) => {
  history.pushState({ page: 'modal', gallery: galleryId }, '', window.location.href);

  store.set('currentPhoto', url);
  store.set('currentPhotoIndex', index);
  store.set('isModalOpen', true);

  applyImageFromCache(url);
  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  updateLikeButton();

  // Prefetch neighbours immediately so left/right feel instant
  prefetchNeighbours(index);

  const images = store.get('currentGalleryImages') || [];
  const show = images.length > 1 ? 'flex' : 'none';
  if (dom.modalPrev) dom.modalPrev.style.display = show;
  if (dom.modalNext) dom.modalNext.style.display = show;
};

const closeModal = () => {
  store.set('isModalOpen', false);
  store.set('currentPhoto', null);
  store.set('currentPhotoIndex', -1);
  if (dom.modalImg) {
    dom.modalImg.src = '';
    dom.modalImg.classList.remove('modal-img--loading');
  }
  dom.modal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
};

// ─────────────────────────────────────────────────────────────────────────────
// LIKE TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

const toggleLike = async () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;
  if (!store.get('functionalCookiesEnabled')) {
    alert('Please accept functional cookies to use the like feature.');
    return;
  }

  const docId = getDocIdFromUrl(currentPhoto);
  const likedKey = `liked_${docId}`;
  const isCurrentlyLiked = localStorage.getItem(likedKey) === 'true';
  const increment = isCurrentlyLiked ? -1 : 1;
  const galleryId = store.get('currentGallery');

  bus.emit('like:toggle', { url: currentPhoto, increment, galleryId });

  // Optimistic UI update
  if (isCurrentlyLiked) {
    localStorage.removeItem(likedKey);
  } else {
    localStorage.setItem(likedKey, 'true');
  }
  updateLikeButton();
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

const setupEventListeners = () => {
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  dom.modalClose?.addEventListener('click', () => history.back(), { signal });
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) history.back();
  }, { signal });
  dom.likeBtn?.addEventListener('click', toggleLike, { signal });
  dom.modalPrev?.addEventListener('click', () => navigateModal('prev'), { signal });
  dom.modalNext?.addEventListener('click', () => navigateModal('next'), { signal });

  document.addEventListener('keydown', (e) => {
    if (!store.get('isModalOpen')) return;
    if (e.key === 'Escape') history.back();
    else if (e.key === 'ArrowLeft') navigateModal('prev');
    else if (e.key === 'ArrowRight') navigateModal('next');
  }, { signal });
};

const subscribeToEvents = () => {
  bus.on('photo:select', openModal);

  bus.on('like:updated', ({ url }) => {
    if (store.get('currentPhoto') === url) updateLikeButton();
  });

  bus.on('modal:close', () => closeModal());
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC
// ─────────────────────────────────────────────────────────────────────────────

export const initModal = () => {
  console.log('📲 Initializing modal module...');
  setupEventListeners();
  subscribeToEvents();
};

export const destroyModal = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
};
