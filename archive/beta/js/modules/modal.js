// js/modules/modal.js
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';

let isProcessing = false; // prevent double like clicks

const updateLikeButton = () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;

  const likesCache = store.get('likesCache') || {};
  const docId = btoa(currentPhoto).replace(/[^a-zA-Z0-9]/g, '');
  const likes = likesCache[docId] || 0;
  const likeCountEl = dom.likeCount;
  const heartEl = dom.likeBtn?.querySelector('.heart');

  if (likeCountEl) likeCountEl.textContent = likes;

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

const openModal = ({ url, galleryId, index }) => {
  history.pushState({ page: 'modal', gallery: galleryId }, '', window.location.href);

  store.set('currentPhoto', url);
  store.set('currentPhotoIndex', index);
  store.set('isModalOpen', true);

  if (dom.modalImg) dom.modalImg.src = url;
  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  updateLikeButton();

  const images = store.get('currentGalleryImages') || [];
  if (images.length <= 1) {
    if (dom.modalPrev) dom.modalPrev.style.display = 'none';
    if (dom.modalNext) dom.modalNext.style.display = 'none';
  } else {
    if (dom.modalPrev) dom.modalPrev.style.display = 'flex';
    if (dom.modalNext) dom.modalNext.style.display = 'flex';
  }
};

const closeModal = () => {
  store.set('isModalOpen', false);
  store.set('currentPhoto', null);
  store.set('currentPhotoIndex', -1);
  dom.modal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
};

const toggleLike = async () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;
  if (!store.get('functionalCookiesEnabled')) {
    alert('Please accept functional cookies to use the like feature.');
    return;
  }
  if (isProcessing) return;

  isProcessing = true;
  const likeBtn = dom.likeBtn;
  if (likeBtn) {
    likeBtn.disabled = true;
    likeBtn.classList.add('loading');
    // Add spinner
    const spinner = document.createElement('div');
    spinner.className = 'like-btn-spinner';
    likeBtn.appendChild(spinner);
  }

  const docId = btoa(currentPhoto).replace(/[^a-zA-Z0-9]/g, '');
  const likedKey = `liked_${docId}`;
  const isCurrentlyLiked = localStorage.getItem(likedKey) === 'true';
  const increment = isCurrentlyLiked ? -1 : 1;

  try {
    // Emit event for firebase module
    bus.emit('like:toggle', { url: currentPhoto, increment });

    // Optimistic UI update
    if (isCurrentlyLiked) {
      localStorage.removeItem(likedKey);
    } else {
      localStorage.setItem(likedKey, 'true');
    }
    updateLikeButton();
  } finally {
    isProcessing = false;
    if (likeBtn) {
      likeBtn.disabled = false;
      likeBtn.classList.remove('loading');
      const spinner = likeBtn.querySelector('.like-btn-spinner');
      if (spinner) spinner.remove();
    }
  }
};

const setupEventListeners = () => {
  const abortController = new AbortController();
  const { signal } = abortController;

  dom.modalClose?.addEventListener('click', closeModal, { signal });
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  }, { signal });
  dom.likeBtn?.addEventListener('click', toggleLike, { signal });
  dom.modalPrev?.addEventListener('click', () => navigateModal('prev'), { signal });
  dom.modalNext?.addEventListener('click', () => navigateModal('next'), { signal });

  document.addEventListener('keydown', (e) => {
    if (!store.get('isModalOpen')) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowLeft') navigateModal('prev');
    else if (e.key === 'ArrowRight') navigateModal('next');
  }, { signal });

  window.addEventListener('popstate', (e) => {
    if (store.get('isModalOpen')) {
      closeModal();
    }
  }, { signal });
};

const subscribeToEvents = () => {
  bus.on('photo:select', openModal);
  bus.on('like:updated', ({ url }) => {
    if (store.get('currentPhoto') === url) {
      updateLikeButton();
    }
  });
  bus.on('modal:close', closeModal);
};

export const initModal = () => {
  console.log('🔲 Initializing modal module...');
  setupEventListeners();
  subscribeToEvents();
};

export const destroyModal = () => {
  // Cleanup handled by AbortController, but we could store it if needed
};
