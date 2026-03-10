// js/modules/modal.js
// Modal lightbox with navigation and like functionality
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';
import { getDocIdFromUrl } from '../lib/utils.js';
import { imageCache } from '../lib/image-cache.js';

let currentAbortController = null;

// Update like button UI based on current photo
const updateLikeButton = () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;

  const likesCache = store.get('likesCache') || {};
  const docId = getDocIdFromUrl(currentPhoto);
  const likes = likesCache[docId] || 0;
  const likeCountEl = dom.likeCount;
  const heartEl = dom.likeBtn?.querySelector('.heart');

  if (likeCountEl) likeCountEl.textContent = likes;

  // Check if liked in localStorage (only if functional enabled)
  let isLiked = false;
  if (store.get('functionalCookiesEnabled')) {
    const likedKey = `liked_${docId}`;
    isLiked = localStorage.getItem(likedKey) === 'true';
  }

  if (heartEl) {
    heartEl.textContent = isLiked ? '♥' : '♡';
    if (isLiked) {
      dom.likeBtn?.classList.add('liked');
    } else {
      dom.likeBtn?.classList.remove('liked');
    }
  }
};

// Apply image from cache — synchronous hit means zero flicker on revisit;
// miss shows a loading class while the blob arrives, then swaps in.
const applyImageFromCache = (url) => {
  if (!dom.modalImg) return;

  if (imageCache.has(url)) {
    // Instant — already in memory
    dom.modalImg.src = imageCache.get(url);
    dom.modalImg.classList.remove('modal-img--loading');
  } else {
    // Show loading state while fetching
    dom.modalImg.classList.add('modal-img--loading');
    imageCache.load(url)
      .then(blobUrl => {
        // Guard against the user having navigated away before fetch completed
        if (store.get('currentPhoto') === url && dom.modalImg) {
          dom.modalImg.src = blobUrl;
          dom.modalImg.classList.remove('modal-img--loading');
        }
      })
      .catch(() => {
        // Fall back gracefully to the direct URL
        if (store.get('currentPhoto') === url && dom.modalImg) {
          dom.modalImg.src = url;
          dom.modalImg.classList.remove('modal-img--loading');
        }
      });
  }
};

// Silently pre-fetch the previous and next full-size images so arrow-key
// navigation is an instant cache hit.
const prefetchNeighbours = (index) => {
  const images = store.get('currentGalleryImages') || [];
  if (images.length <= 1) return;
  const prevIdx = (index - 1 + images.length) % images.length;
  const nextIdx = (index + 1) % images.length;
  imageCache.load(images[prevIdx].url).catch(() => {});
  imageCache.load(images[nextIdx].url).catch(() => {});
};

// Navigate modal to previous/next image
const navigateModal = (direction) => {
  const currentIndex = store.get('currentPhotoIndex');
  const images = store.get('currentGalleryImages') || [];
  if (images.length === 0) return;

  let newIndex;
  if (direction === 'prev') {
    newIndex = (currentIndex - 1 + images.length) % images.length;
  } else {
    newIndex = (currentIndex + 1) % images.length;
  }

  const nextImage = images[newIndex];
  store.set('currentPhoto', nextImage.url);
  store.set('currentPhotoIndex', newIndex);

  applyImageFromCache(nextImage.url);
  prefetchNeighbours(newIndex);

  updateLikeButton();
};

// Open modal
const openModal = ({ url, galleryId, index }) => {
  // Push history state so that back closes the modal
  history.pushState({ page: 'modal', gallery: galleryId }, '', window.location.href);

  store.set('currentPhoto', url);
  store.set('currentPhotoIndex', index);
  store.set('isModalOpen', true);

  applyImageFromCache(url);
  prefetchNeighbours(index);

  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  updateLikeButton();

  // Show/hide navigation buttons based on image count
  const images = store.get('currentGalleryImages') || [];
  if (images.length <= 1) {
    if (dom.modalPrev) dom.modalPrev.style.display = 'none';
    if (dom.modalNext) dom.modalNext.style.display = 'none';
  } else {
    if (dom.modalPrev) dom.modalPrev.style.display = 'flex';
    if (dom.modalNext) dom.modalNext.style.display = 'flex';
  }
};

// Close modal (called only from popstate handler or internally when resetting)
const closeModal = () => {
  store.set('isModalOpen', false);
  store.set('currentPhoto', null);
  store.set('currentPhotoIndex', -1);
  dom.modal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
};

// Toggle like
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

  // Emit event for firebase module to handle, including galleryId
  bus.emit('like:toggle', { url: currentPhoto, increment, galleryId });

  // Optimistic UI update
  if (isCurrentlyLiked) {
    localStorage.removeItem(likedKey);
  } else {
    localStorage.setItem(likedKey, 'true');
  }
  updateLikeButton(); // update heart immediately
};

// Setup event listeners
const setupEventListeners = () => {
  // Abort previous controller if any
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  // Modal close button — use history.back() to let popstate handle closing
  dom.modalClose?.addEventListener('click', () => history.back(), { signal });

  // Click on modal background — also use history.back()
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) history.back();
  }, { signal });

  // Like button
  dom.likeBtn?.addEventListener('click', toggleLike, { signal });

  // Navigation buttons
  dom.modalPrev?.addEventListener('click', () => navigateModal('prev'), { signal });
  dom.modalNext?.addEventListener('click', () => navigateModal('next'), { signal });

  // Keyboard navigation — Escape calls history.back()
  document.addEventListener('keydown', (e) => {
    if (!store.get('isModalOpen')) return;
    if (e.key === 'Escape') history.back();
    else if (e.key === 'ArrowLeft') navigateModal('prev');
    else if (e.key === 'ArrowRight') navigateModal('next');
  }, { signal });

  // Handle history back — popstate is handled in navigation module,
  // which emits 'modal:close'. We subscribe to that below.
};

// Subscribe to events
const subscribeToEvents = () => {
  // When photo selected from gallery
  bus.on('photo:select', openModal);

  // When likes are updated (from firebase)
  bus.on('like:updated', ({ url }) => {
    // Refresh button UI if this is the currently viewed photo
    if (store.get('currentPhoto') === url) {
      updateLikeButton();
    }
  });

  // Listen for modal close event from navigation (popstate)
  bus.on('modal:close', () => {
    closeModal();
  });
};

// Public init
export const initModal = () => {
  console.log('📲 Initializing modal module...');
  setupEventListeners();
  subscribeToEvents();
};

// Cleanup (if needed)
export const destroyModal = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
};
