// ============================================
// MODAL MODULE — Lightbox, likes, image navigation
// Listens for 'photo:selected' from gallery.js via event bus.
// ============================================

import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { toggleLike, getLikeCount, isImageLiked } from './firebase.js';

let controller;

// ── Open / Close ─────────────────────────────

async function openModal({ url, index }) {
  store.set('currentModalImageUrl', url);
  store.set('currentModalImageIndex', index);
  store.set('isModalOpen', true);

  if (dom.modal) dom.modal.hidden = false;
  if (dom.modalImg) {
    dom.modalImg.src = url;
    dom.modalImg.alt = `Photo ${index + 1}`;
  }

  updateLikeUI(url);

  // Push history state for back button
  if (!store.get('isPopstateClosing')) {
    history.pushState(
      { type: 'photo', url, index, gallery: store.get('currentGallery') },
      '',
      `#photo-${index}`
    );
  }
}

function closeModal() {
  store.set('isModalOpen', false);
  store.set('currentModalImageUrl', null);
  store.set('currentModalImageIndex', -1);

  if (dom.modal) dom.modal.hidden = true;
  if (dom.modalImg) dom.modalImg.src = '';
}

export function closeModalDirect() {
  closeModal();
}

// ── Like UI ──────────────────────────────────

async function updateLikeUI(url) {
  if (!url) return;

  const liked = isImageLiked(url);
  const count = await getLikeCount(url);

  if (dom.likeBtn) {
    dom.likeBtn.classList.toggle('liked', liked);
    const heart = dom.likeBtn.querySelector('.heart');
    if (heart) heart.textContent = liked ? '♥' : '♡';
  }
  if (dom.likeCount) {
    dom.likeCount.textContent = count;
  }
}

async function handleLikeClick() {
  const url = store.get('currentModalImageUrl');
  if (!url || store.get('isProcessing')) return;

  if (!store.get('functionalCookiesEnabled')) {
    alert('Please accept functional cookies to use the like feature.');
    return;
  }

  // Show spinner
  if (dom.likeBtn) {
    dom.likeBtn.classList.add('loading');
    const spinner = document.createElement('div');
    spinner.className = 'like-btn-spinner';
    dom.likeBtn.appendChild(spinner);
  }

  try {
    const result = await toggleLike(url);
    if (result) {
      if (dom.likeBtn) {
        dom.likeBtn.classList.toggle('liked', result.isLiked);
        const heart = dom.likeBtn.querySelector('.heart');
        if (heart) heart.textContent = result.isLiked ? '♥' : '♡';
      }
      if (dom.likeCount) {
        dom.likeCount.textContent = result.count;
      }
    }
  } finally {
    // Remove spinner
    if (dom.likeBtn) {
      dom.likeBtn.classList.remove('loading');
      const spinner = dom.likeBtn.querySelector('.like-btn-spinner');
      if (spinner) spinner.remove();
    }
  }
}

// ── Navigation (prev/next) ───────────────────

function navigatePhoto(direction) {
  const images = store.get('currentGalleryImages');
  let index = store.get('currentModalImageIndex');
  if (!images || images.length === 0) return;

  index += direction;
  if (index < 0) index = images.length - 1;
  if (index >= images.length) index = 0;

  const url = images[index];
  store.set('currentModalImageUrl', url);
  store.set('currentModalImageIndex', index);

  if (dom.modalImg) {
    dom.modalImg.src = url;
    dom.modalImg.alt = `Photo ${index + 1}`;
  }

  updateLikeUI(url);

  // Replace history state for photo navigation
  history.replaceState(
    { type: 'photo', url, index, gallery: store.get('currentGallery') },
    '',
    `#photo-${index}`
  );
}

// ── Touch swipe on modal ─────────────────────

let modalTouchStartX = 0;

function onModalTouchStart(e) {
  modalTouchStartX = e.touches[0].clientX;
}

function onModalTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - modalTouchStartX;
  if (Math.abs(dx) > 50) {
    navigatePhoto(dx > 0 ? -1 : 1);
  }
}

// ── Keyboard ─────────────────────────────────

function onKeydown(e) {
  if (!store.get('isModalOpen')) return;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeModal();
      if (!store.get('isPopstateClosing')) {
        history.back();
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      navigatePhoto(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      navigatePhoto(1);
      break;
  }
}

// ── Init / Destroy ───────────────────────────

export function initModal() {
  controller = new AbortController();
  const { signal } = controller;

  // Subscribe to photo selection from gallery
  bus.on('photo:selected', openModal);

  // Close button
  dom.modalClose?.addEventListener('click', () => {
    closeModal();
    if (!store.get('isPopstateClosing')) {
      history.back();
    }
  }, { signal });

  // Click outside image to close
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) {
      closeModal();
      if (!store.get('isPopstateClosing')) {
        history.back();
      }
    }
  }, { signal });

  // Navigation buttons
  dom.modalPrev?.addEventListener('click', () => navigatePhoto(-1), { signal });
  dom.modalNext?.addEventListener('click', () => navigatePhoto(1), { signal });

  // Like button
  dom.likeBtn?.addEventListener('click', handleLikeClick, { signal });

  // Touch swipe on modal
  dom.modal?.addEventListener('touchstart', onModalTouchStart, { passive: true, signal });
  dom.modal?.addEventListener('touchend', onModalTouchEnd, { passive: true, signal });

  // Keyboard (modal-specific)
  document.addEventListener('keydown', onKeydown, { signal });

  // Listen for like updates from firebase module
  bus.on('likes:updated', ({ url }) => {
    if (url === store.get('currentModalImageUrl')) {
      updateLikeUI(url);
    }
  });
}

export function destroyModal() {
  controller?.abort();
}
