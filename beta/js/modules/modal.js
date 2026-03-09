// js/modules/modal.js
// Modal lightbox with navigation, like functionality, and image caching.
// Full-size images are served through the shared imageCache singleton so a
// photo opened a second time (or prefetched by navigateModal) costs zero bytes.
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';
import { getDocIdFromUrl } from '../lib/utils.js';
import { imageCache } from '../lib/image-cache.js';

let currentAbortController = null;

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
// IMAGE LOADING (cache-first)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a full-size image to the modal <img> element using the shared
 * imageCache. On a synchronous hit the src is set with no network round-trip.
 * On a miss it shows a loading state, fetches/caches the blob, then sets src —
 * but only if the user hasn't already navigated away while the fetch was in flight.
 *
 * @param {string} url  Full-size image URL to display.
 */
const applyImageFromCache = (url) => {
  const img = dom.modalImg;
  if (!img) return;

  // ── Synchronous hit — zero flicker ───────────────────────────────────────
  if (imageCache.has(url)) {
    img.src = imageCache.get(url);
    img.classList.remove('modal-img--loading');
    return;
  }

  // ── Cache miss — show loading state and fetch ─────────────────────────────
  img.classList.add('modal-img--loading');

  imageCache.load(url).then(resolvedUrl => {
    // Guard: user may have navigated to a different image while fetching
    if (store.get('currentPhoto') !== url) return;
    img.src = resolvedUrl;
    img.classList.remove('modal-img--loading');
  });
};

/**
 * Silently pre-warms the cache for the images adjacent to `index` so that
 * pressing ◄ / ► feels instant. Fires in the background; errors are ignored.
 *
 * @param {number} index  Current image index in currentGalleryImages.
 */
const prefetchNeighbours = (index) => {
  const images = store.get('currentGalleryImages') || [];
  if (images.length <= 1) return;

  const prevIndex = (index - 1 + images.length) % images.length;
  const nextIndex = (index + 1) % images.length;

  // imageCache.load() deduplicates concurrent requests internally
  [prevIndex, nextIndex].forEach(i => {
    const url = images[i]?.url;
    if (url && !imageCache.has(url)) {
      console.debug(`🔮 [ImageCache] Prefetching neighbour: ${url.split('/').pop()}`);
      imageCache.load(url); // fire-and-forget
    }
  });
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

  // Load full-size image through cache
  applyImageFromCache(url);

  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  updateLikeButton();

  const images = store.get('currentGalleryImages') || [];
  const hasMany = images.length > 1;
  if (dom.modalPrev) dom.modalPrev.style.display = hasMany ? 'flex' : 'none';
  if (dom.modalNext) dom.modalNext.style.display = hasMany ? 'flex' : 'none';

  // Pre-warm the adjacent images immediately after opening
  prefetchNeighbours(index);
};

const closeModal = () => {
  store.set('isModalOpen', false);
  store.set('currentPhoto', null);
  store.set('currentPhotoIndex', -1);
  dom.modal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
  // Clear src so the previous image doesn't flash when the modal reopens
  if (dom.modalImg) {
    dom.modalImg.src = '';
    dom.modalImg.classList.remove('modal-img--loading');
  }
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
    if (store.get('currentPhoto') === url) {
      updateLikeButton();
    }
  });

  bus.on('modal:close', () => {
    closeModal();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
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
