import { dom } from '../dom-elements.js';
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { updateLike } from './firebase.js';
import { withErrorHandling } from '../lib/error-handler.js';

export function initModal() {
  // listen for photo selection
  bus.on('photo:selected', ({ url, gallery, index }) => openModal(url, gallery, index));
  bus.on('gallery:contentLoaded', () => { /* update nav context */ });
  bus.on('likes:updated', () => updateLikeButton());

  // DOM listeners
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) bus.emit('navigation:closeModal');
  });
  dom.modalClose?.addEventListener('click', () => bus.emit('navigation:closeModal'));
  dom.likeBtn?.addEventListener('click', handleLike);
  dom.modalPrev?.addEventListener('click', () => navigateModal(-1));
  dom.modalNext?.addEventListener('click', () => navigateModal(1));
  document.addEventListener('keydown', (e) => {
    if (!store.get('isModalOpen')) return;
    if (e.key === 'Escape') bus.emit('navigation:closeModal');
    if (e.key === 'ArrowLeft') navigateModal(-1);
    if (e.key === 'ArrowRight') navigateModal(1);
  });
}

function openModal(url, gallery, index) {
  store.set('currentPhoto', { url, gallery, index });
  store.set('isModalOpen', true);
  dom.modal?.removeAttribute('hidden');
  dom.modalImg.src = url;
  document.body.style.overflow = 'hidden';
  updateLikeButton();
  bus.emit('navigation:photoOpened', { url, gallery, index });
}

function navigateModal(direction) {
  const current = store.get('currentPhoto');
  const images = store.get('currentGalleryImages');
  if (!images?.length) return;
  let newIndex = (current.index + direction + images.length) % images.length;
  const newPhoto = images[newIndex];
  store.set('currentPhoto', { ...newPhoto, index: newIndex });
  dom.modalImg.src = newPhoto.url;
  updateLikeButton();
  bus.emit('photo:changed', newPhoto);
}

function updateLikeButton() {
  const photo = store.get('currentPhoto');
  if (!photo) return;
  const docId = btoa(photo.url).replace(/[^a-zA-Z0-9]/g, '');
  const likes = store.get('likesCache')[docId] || 0;
  if (dom.likeCount) dom.likeCount.textContent = likes;
  const liked = store.get('functionalCookies') && localStorage.getItem(`liked_${docId}`) === 'true';
  const heart = dom.likeBtn?.querySelector('.heart');
  if (heart) {
    heart.textContent = liked ? '♥' : '♡';
    dom.likeBtn?.classList.toggle('liked', liked);
  }
}

const handleLike = withErrorHandling(async () => {
  if (!store.get('functionalCookies')) {
    alert('Please accept functional cookies to use the like feature.');
    return;
  }
  const photo = store.get('currentPhoto');
  if (!photo) return;
  const docId = btoa(photo.url).replace(/[^a-zA-Z0-9]/g, '');
  const liked = localStorage.getItem(`liked_${docId}`) === 'true';
  const newLikes = await updateLike(photo.url, liked ? -1 : 1);
  if (newLikes !== null) {
    if (liked) localStorage.removeItem(`liked_${docId}`);
    else localStorage.setItem(`liked_${docId}`, 'true');

    // update store and UI
    const cache = store.get('likesCache');
    cache[docId] = newLikes;
    store.set('likesCache', cache);
    bus.emit('likes:updated', cache);
  }
});

export function closeModal() {
  store.set('isModalOpen', false);
  dom.modal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
}