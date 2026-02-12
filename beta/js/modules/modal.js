// js/modules/modal.js
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { updateLike } from './firebase.js';
import { withErrorHandling } from '../lib/error-handler.js';
import { NAV_EVENTS } from '../lib/navigation-fsm.js';

let isProcessing = false;

function getDocIdFromUrl(url) {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
}

async function toggleLike() {
    const url = store.get('currentModalImageUrl');
    if (!url || isProcessing) return;
    if (!store.get('functionalCookiesEnabled')) {
        alert('Please accept functional cookies to use the like feature.');
        return;
    }

    isProcessing = true;
    dom.likeBtn.disabled = true;
    dom.likeBtn.classList.add('loading');

    const docId = getDocIdFromUrl(url);
    const likedKey = `liked_${docId}`;
    const isLiked = localStorage.getItem(likedKey) === 'true';
    const increment = isLiked ? -1 : 1;

    try {
        const newLikes = await updateLike(url, increment);
        if (newLikes !== null) {
            if (isLiked) localStorage.removeItem(likedKey);
            else localStorage.setItem(likedKey, 'true');

            const cache = store.get('likesCache');
            cache[docId] = newLikes;
            store.set('likesCache', { ...cache });

            const galleryData = store.get('galleryImageData');
            let updated = false;
            Object.keys(galleryData).forEach(gKey => {
                const idx = galleryData[gKey].findIndex(img => img.url === url);
                if (idx !== -1) {
                    galleryData[gKey][idx].likes = newLikes;
                    updated = true;
                }
            });
            if (updated) store.set('galleryImageData', { ...galleryData });

            updateLikeButtonUI();
        }
    } catch (err) {
        console.error('Like error:', err);
    } finally {
        isProcessing = false;
        dom.likeBtn.disabled = false;
        dom.likeBtn.classList.remove('loading');
    }
}

function updateLikeButtonUI() {
    const url = store.get('currentModalImageUrl');
    if (!url) return;

    const docId = getDocIdFromUrl(url);
    const likes = store.get('likesCache')[docId] || 0;
    if (dom.likeCount) dom.likeCount.textContent = likes;

    const isLiked = store.get('functionalCookiesEnabled') && localStorage.getItem(`liked_${docId}`) === 'true';
    if (dom.heart) {
        dom.heart.textContent = isLiked ? '♥' : '♡';
        dom.likeBtn.classList.toggle('liked', isLiked);
    }
}

function updateNavButtons() {
    const images = store.get('currentGalleryImages');
    const hasMultiple = images.length > 1;
    if (dom.modalPrev) dom.modalPrev.style.display = hasMultiple ? 'flex' : 'none';
    if (dom.modalNext) dom.modalNext.style.display = hasMultiple ? 'flex' : 'none';
}

function navigateModal(direction) {
    const images = store.get('currentGalleryImages');
    if (images.length === 0) return;

    let index = store.get('currentModalImageIndex');
    if (direction === 'prev') index = (index - 1 + images.length) % images.length;
    else index = (index + 1) % images.length;

    const nextImage = images[index];
    store.set('currentModalImageUrl', nextImage.url);
    store.set('currentModalImageIndex', index);
    dom.modalImg.src = nextImage.url;

    updateLikeButtonUI();
}

function openModal({ url, galleryKey, index }) {
    store.set('currentModalImageUrl', url);
    store.set('currentModalImageIndex', index);
    store.set('isModalOpen', true);

    dom.modalImg.src = url;
    dom.modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';

    updateLikeButtonUI();
    updateNavButtons();

    bus.emit(NAV_EVENTS.OPEN_PHOTO, { galleryId: galleryKey });
}

function closeModal({ skipHistory = false } = {}) {
    if (!skipHistory) {
        bus.emit(NAV_EVENTS.CLOSE_PHOTO);
        return;
    }

    dom.modal.setAttribute('hidden', '');
    store.set('currentModalImageUrl', null);
    store.set('currentModalImageIndex', -1);
    store.set('isModalOpen', false);
    document.body.style.overflow = 'auto';
}

// ---------- Init ----------
export function initModal() {
    dom.modalClose?.addEventListener('click', () => closeModal());
    dom.modal?.addEventListener('click', (e) => {
        if (e.target === dom.modal) closeModal();
    });
    dom.likeBtn?.addEventListener('click', withErrorHandling(toggleLike, { module: 'modal' }));
    dom.modalPrev?.addEventListener('click', () => navigateModal('prev'));
    dom.modalNext?.addEventListener('click', () => navigateModal('next'));

    document.addEventListener('keydown', (e) => {
        if (!store.get('isModalOpen')) return;
        switch (e.key) {
            case 'Escape': closeModal(); break;
            case 'ArrowLeft': navigateModal('prev'); break;
            case 'ArrowRight': navigateModal('next'); break;
        }
    });
}

// ---------- Exports ----------
export { closeModal };   // ✅ EXPORTED – fixes the import error

// ---------- Bus subscriptions ----------
bus.on('photo:open', openModal);
bus.on('ui:closeModal', (payload) => closeModal(payload));
bus.on('ui:reopenModal', () => {
    const url = store.get('currentModalImageUrl');
    const idx = store.get('currentModalImageIndex');
    const gallery = store.get('currentGallery');
    if (url && idx !== -1 && gallery) {
        openModal({ url, galleryKey: gallery, index: idx });
    }
});