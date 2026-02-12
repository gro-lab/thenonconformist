// ============================================
// MODAL MODULE — Lightbox, like toggle, image navigation
// ============================================

import { store } from './store.js';
import { bus } from './event-bus.js';
import { dom } from './dom-elements.js';
import { getDocIdFromUrl, updateLike } from './firebase.js';

let controller; // AbortController for lifecycle cleanup

// ── Open / Close ─────────────────────────────

export function openModal({ imageUrl, category, galleryKey, imageIndex }) {
  store.set('currentModalImageUrl', imageUrl);
  store.set('currentModalImageIndex', imageIndex);
  store.set('isModalOpen', true);

  if (dom.modalImg) dom.modalImg.src = imageUrl;

  history.pushState({ page: 'modal', gallery: galleryKey }, '', window.location.href);

  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  updateLikeButton();
  updateNavButtons();
}

export function closeModalDirect() {
  dom.modal?.setAttribute('hidden', '');
  store.set('currentModalImageUrl', null);
  store.set('currentModalImageIndex', -1);
  store.set('isModalOpen', false);
  document.body.style.overflow = 'auto';
}

export function closeModal() {
  if (store.get('isPopstateClosing')) {
    closeModalDirect();
    return;
  }
  history.back();
}

// ── Image Navigation ─────────────────────────

function navigateModal(direction) {
  const images = store.get('currentGalleryImages');
  if (!images.length) return;

  let idx = store.get('currentModalImageIndex');
  idx = direction === 'prev'
    ? (idx - 1 + images.length) % images.length
    : (idx + 1) % images.length;

  const next = images[idx];
  store.set('currentModalImageIndex', idx);
  store.set('currentModalImageUrl', next.url);

  if (dom.modalImg) dom.modalImg.src = next.url;

  updateLikeButton();
  updateNavButtons();
}

function updateNavButtons() {
  const count = store.get('currentGalleryImages').length;
  const display = count <= 1 ? 'none' : 'flex';
  if (dom.modalPrev) dom.modalPrev.style.display = display;
  if (dom.modalNext) dom.modalNext.style.display = display;
}

// ── Like Button ──────────────────────────────

function updateLikeButton() {
  const url = store.get('currentModalImageUrl');
  if (!url) return;

  const docId = getDocIdFromUrl(url);
  const likes = store.get('likesCache')[docId] || 0;
  const heart = dom.likeBtn?.querySelector('.heart');

  if (dom.likeCount) dom.likeCount.textContent = likes;

  let isLiked = false;
  if (store.get('functionalCookiesEnabled')) {
    isLiked = localStorage.getItem(`liked_${docId}`) === 'true';
  }

  if (heart) {
    heart.textContent = isLiked ? '♥' : '♡';
    dom.likeBtn.classList.toggle('liked', isLiked);
  }
}

async function toggleLike() {
  const url = store.get('currentModalImageUrl');
  if (!url || store.get('isProcessing')) return;

  if (!store.get('functionalCookiesEnabled')) {
    alert('Please accept functional cookies to use the like feature.');
    return;
  }

  store.set('isProcessing', true);
  dom.likeBtn.disabled = true;
  dom.likeBtn.classList.add('loading');

  const spinner = document.createElement('div');
  spinner.className = 'like-btn-spinner';
  dom.likeBtn.appendChild(spinner);

  const docId = getDocIdFromUrl(url);
  const isCurrentlyLiked = localStorage.getItem(`liked_${docId}`) === 'true';

  try {
    const incrementValue = isCurrentlyLiked ? -1 : 1;
    const newLikes = await updateLike(url, incrementValue);

    if (newLikes !== null) {
      // Toggle localStorage liked state
      if (isCurrentlyLiked) {
        localStorage.removeItem(`liked_${docId}`);
      } else {
        localStorage.setItem(`liked_${docId}`, 'true');
      }

      // Update likes in galleryImageData
      const allData = store.get('galleryImageData');
      Object.keys(allData).forEach((key) => {
        const img = allData[key].find((i) => i.url === url);
        if (img) img.likes = newLikes;
      });

      updateLikeButton();
      bus.emit('gallery:reload');
    }
  } catch (error) {
    console.error('Error toggling like:', error);
  } finally {
    store.set('isProcessing', false);
    dom.likeBtn.disabled = false;
    dom.likeBtn.classList.remove('loading');
    dom.likeBtn.querySelector('.like-btn-spinner')?.remove();
  }
}

// ── Event Listeners ──────────────────────────

export function initModal() {
  controller = new AbortController();
  const { signal } = controller;

  dom.modalClose?.addEventListener('click', closeModal, { signal });
  dom.likeBtn?.addEventListener('click', toggleLike, { signal });
  dom.modalPrev?.addEventListener('click', () => navigateModal('prev'), { signal });
  dom.modalNext?.addEventListener('click', () => navigateModal('next'), { signal });

  // Click outside image to close
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  }, { signal });

  // Keyboard: Escape, ArrowLeft, ArrowRight
  document.addEventListener('keydown', (e) => {
    if (dom.modal?.hasAttribute('hidden')) return;

    switch (e.key) {
      case 'Escape':     closeModal(); break;
      case 'ArrowLeft':  navigateModal('prev'); break;
      case 'ArrowRight': navigateModal('next'); break;
    }
  }, { signal });

  // Listen for open events from gallery
  bus.on('modal:open', openModal);
}

export function destroyModal() {
  controller?.abort();
}
