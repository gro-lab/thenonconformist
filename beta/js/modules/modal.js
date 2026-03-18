// js/modules/modal.js
// Modal lightbox with navigation and like functionality
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';
import { getDocIdFromUrl } from '../lib/utils.js';
import { imageCache } from '../lib/image-cache.js';

let currentAbortController = null;

// ==================== Document Title ====================
const originalTitle = document.title;

const galleryTitles = {
  low: 'Language of Windows',
  sol: 'Snapshots of Life',
  r: 'Reflections',
  sa: 'Street Art'
};

// ==================== Swipe State ====================
let swipeTouchStartX = 0;
let swipeTouchStartY = 0;
const SWIPE_THRESHOLD = 50; // px — minimum horizontal distance to trigger navigation

// ==================== Cookie Prompt Modal ====================
const createCookiePromptModal = () => {
  if (document.getElementById('cookie-prompt-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'cookie-prompt-modal';
  modal.className = 'modal';
  modal.setAttribute('hidden', '');
  modal.style.cssText = 'z-index: 500;';
  modal.innerHTML = `
    <button class="modal-close" id="cookie-prompt-close">×</button>
    <div class="modal-content" style="text-align: center; max-width: 400px;">
      <div style="font-size: 2.5rem; margin-bottom: 1.25rem; opacity: 0.6;">♡</div>
      <h2 style="margin-bottom: 0.75rem; font-size: 1.25rem; font-weight: 500;">Likes require your consent</h2>
      <p style="color: var(--color-text-muted); margin-bottom: 2rem; line-height: 1.7; font-size: 0.9rem;">
        To like images, functional cookies must be enabled. This allows the site to remember your likes.
      </p>
      <button id="cookie-prompt-enable" class="cookie-btn cookie-btn-primary" style="width: 100%; padding: 0.75rem 1.25rem; font-size: 0.9rem;">
        Enable functional cookies
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#cookie-prompt-close').addEventListener('click', closeCookiePrompt);
  modal.querySelector('#cookie-prompt-enable').addEventListener('click', () => {
    closeCookiePrompt();
    // Open the cookie settings modal via the floating button
    document.getElementById('cookie-float-btn')?.click();
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCookiePrompt();
  });
};

const showCookiePrompt = () => {
  createCookiePromptModal();
  document.getElementById('cookie-prompt-modal')?.removeAttribute('hidden');
};

const closeCookiePrompt = () => {
  document.getElementById('cookie-prompt-modal')?.setAttribute('hidden', '');
};

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

  // Show/hide like button based on cookie consent
  if (dom.likeBtn) {
    dom.likeBtn.hidden = !store.get('functionalCookiesEnabled');
  }
};

// Apply image to modal — synchronous cache hit shows blob instantly;
// cache miss falls back to the raw URL immediately (no stale image shown)
// and primes the cache in the background for next time.
const applyImageFromCache = (url) => {
  if (!dom.modalImg) return;

  if (imageCache.has(url)) {
    // Already in memory — instant, no network round-trip
    dom.modalImg.src = imageCache.get(url);
  } else {
    // Show immediately via direct URL (same as before caching was added)
    dom.modalImg.src = url;
    // Prime the cache silently so the next visit is a synchronous hit
    imageCache.load(url).catch(() => {});
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

  // Update URL hash for deep-linking
  const newUrl = `${window.location.pathname}#/${store.get('currentGallery')}/${newIndex + 1}`;
  history.replaceState({ page: 'modal', gallery: store.get('currentGallery'), index: newIndex }, '', newUrl);

  // Update document title
  const galleryId = store.get('currentGallery');
  const galleryTitle = galleryTitles[galleryId] || 'Gallery';
  document.title = `The Nonconformist | ${galleryTitle}`;

  updateLikeButton();
};

// Open modal
const openModal = ({ url, galleryId, index }) => {
  // Push history state with hash fragment for deep-linking
  const hash = `#/${galleryId}/${index + 1}`;
  history.pushState({ page: 'modal', gallery: galleryId, index }, '', window.location.href.split('#')[0] + hash);

  store.set('currentPhoto', url);
  store.set('currentPhotoIndex', index);
  store.set('isModalOpen', true);

  applyImageFromCache(url);
  prefetchNeighbours(index);

  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  // Update document title
  const galleryTitle = galleryTitles[galleryId] || 'Gallery';
  document.title = `The Nonconformist | ${galleryTitle}`;

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

  // Restore document title
  document.title = originalTitle;
};

// Toggle like
const toggleLike = async () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;
  if (!store.get('functionalCookiesEnabled')) {
    showCookiePrompt();
    return;
  }

  const docId = getDocIdFromUrl(currentPhoto);
  const likedKey = `liked_${docId}`;
  const isCurrentlyLiked = localStorage.getItem(likedKey) === 'true';
  const increment = isCurrentlyLiked ? -1 : 1;
  const galleryId = store.get('currentGallery');

  // Mobile haptic feedback on like
  if (navigator.vibrate && !isCurrentlyLiked) {
    navigator.vibrate(50); // 50ms pulse
  }

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

// ==================== Swipe Handlers ====================
const onTouchStart = (e) => {
  // Only track single-finger touches; ignore multi-touch (pinch-zoom etc.)
  if (e.touches.length !== 1) return;
  swipeTouchStartX = e.touches[0].clientX;
  swipeTouchStartY = e.touches[0].clientY;
};

const onTouchEnd = (e) => {
  if (e.changedTouches.length !== 1) return;

  const deltaX = e.changedTouches[0].clientX - swipeTouchStartX;
  const deltaY = e.changedTouches[0].clientY - swipeTouchStartY;

  // Require the gesture to be more horizontal than vertical (natural swipe feel)
  if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return;

  if (deltaX < 0) {
    navigateModal('next'); // swipe left  → next image
  } else {
    navigateModal('prev'); // swipe right → previous image
  }
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

  // Keyboard navigation — Escape also closes cookie prompt if open
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Check for cookie prompt modal first
      const cookiePrompt = document.getElementById('cookie-prompt-modal');
      if (cookiePrompt && !cookiePrompt.hidden) {
        closeCookiePrompt();
        return;
      }
      if (!store.get('isModalOpen')) return;
      history.back();
    }
    else if (e.key === 'ArrowLeft' && store.get('isModalOpen')) navigateModal('prev');
    else if (e.key === 'ArrowRight' && store.get('isModalOpen')) navigateModal('next');
  }, { signal });

  // Swipe gestures — attached to the modal overlay so the whole surface is
  // a hit target, not just the image element itself.
  dom.modal?.addEventListener('touchstart', onTouchStart, { passive: true, signal });
  dom.modal?.addEventListener('touchend', onTouchEnd, { passive: true, signal });
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

  // When consent changes, refresh like button visibility
  bus.on('consent:applied', () => {
    if (store.get('isModalOpen')) {
      updateLikeButton();
    }
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
