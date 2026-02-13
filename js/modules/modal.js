// js/modules/modal.js
// Modal lightbox with navigation and like functionality
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';

let currentAbortController = null;

// Update like button UI based on current photo
const updateLikeButton = () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;

  const likesCache = store.get('likesCache') || {};
  const docId = btoa(currentPhoto).replace(/[^a-zA-Z0-9]/g, '');
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
  if (dom.modalImg) dom.modalImg.src = nextImage.url;

  updateLikeButton();
};

// Open modal
const openModal = ({ url, galleryId, index }) => {
  // Push history state
  history.pushState({ page: 'modal', gallery: galleryId }, '', window.location.href);

  store.set('currentPhoto', url);
  store.set('currentPhotoIndex', index);
  store.set('isModalOpen', true);

  if (dom.modalImg) dom.modalImg.src = url;
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

// Close modal
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

  const docId = btoa(currentPhoto).replace(/[^a-zA-Z0-9]/g, '');
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

  // Modal close button
  dom.modalClose?.addEventListener('click', closeModal, { signal });

  // Click on modal background
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  }, { signal });

  // Like button
  dom.likeBtn?.addEventListener('click', toggleLike, { signal });

  // Navigation buttons
  dom.modalPrev?.addEventListener('click', () => navigateModal('prev'), { signal });
  dom.modalNext?.addEventListener('click', () => navigateModal('next'), { signal });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!store.get('isModalOpen')) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowLeft') navigateModal('prev');
    else if (e.key === 'ArrowRight') navigateModal('next');
  }, { signal });

  // Handle history back
  window.addEventListener('popstate', (e) => {
    if (store.get('isModalOpen')) {
      closeModal();
    }
  }, { signal });
};

// Subscribe to events
const subscribeToEvents = () => {
  // When photo selected from gallery
  bus.on('photo:select', openModal);

  // When likes are updated (from firebase)
  bus.on('like:updated', ({ url, newLikes }) => {
    // Update cache (firebase already did, but ensure store is updated)
    // Then refresh button UI
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
  console.log('🔲 Initializing modal module...');
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
