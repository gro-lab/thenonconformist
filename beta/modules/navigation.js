import { dom } from '../dom-elements.js';
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { createFSM } from '../lib/navigation-fsm.js';
import { openGallery, loadGalleryContent } from './gallery.js';
import { closeModal } from './modal.js';

const fsm = createFSM({
  initial: 'browsing',
  states: {
    browsing: {
      SELECT_GALLERY: { target: 'viewingGallery', action: (galleryId) => {
        openGallery(galleryId);
        loadGalleryContent(galleryId);
        history.pushState({ page: 'gallery', gallery: galleryId }, '', window.location.href);
      }},
      OPEN_PHOTO: { target: 'viewingPhoto', action: ({ url, gallery, index }) => {
        history.pushState({ page: 'photo', gallery, index }, '', window.location.href);
      }},
      OPEN_TERMS: { target: 'browsing', action: () => {
        history.pushState({ page: 'terms' }, '', window.location.href);
        dom.termsModal?.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
      }},
    },
    viewingGallery: {
      OPEN_PHOTO: { target: 'viewingPhoto', action: ({ url, gallery, index }) => {
        history.pushState({ page: 'photo', gallery, index }, '', window.location.href);
      }},
      POPSTATE: { target: 'browsing', action: () => {
        // close gallery without pushing state
        closeGalleryDirect();
      }},
      CLOSE_GALLERY: { target: 'browsing', action: () => {
        history.back();
      }},
    },
    viewingPhoto: {
      CLOSE: { target: 'viewingGallery', action: () => history.back() },
      NEXT_PHOTO: { target: 'viewingPhoto', action: (photo) => {
        history.replaceState({ page: 'photo', gallery: photo.gallery, index: photo.index }, '', window.location.href);
      }},
      POPSTATE: { target: 'viewingGallery', action: closeModal },
    },
  },
});

export function initNavigation() {
  // initial homepage trap
  history.replaceState({ page: 'home' }, '', window.location.href);
  history.pushState({ page: 'home-trap' }, '', window.location.href);

  window.addEventListener('popstate', (e) => {
    const state = e.state || {};
    if (state.page === 'home' || state.page === 'home-trap') {
      if (store.get('isModalOpen')) fsm.send('POPSTATE');
      else if (store.get('isGalleryOpen')) fsm.send('POPSTATE');
      // otherwise do nothing – stay on homepage
    } else if (state.page === 'gallery') {
      // already in gallery, do nothing? Actually we close when popping to home
    } else if (state.page === 'photo') {
      fsm.send('POPSTATE');
    } else if (state.page === 'terms') {
      // terms modal close is handled elsewhere
    }
  });

  // bus listeners
  bus.on('gallery:select', (id) => fsm.send('SELECT_GALLERY', id));
  bus.on('photo:selected', (data) => fsm.send('OPEN_PHOTO', data));
  bus.on('navigation:closeGallery', () => fsm.send('CLOSE_GALLERY'));
  bus.on('navigation:closeModal', () => fsm.send('CLOSE'));
  bus.on('photo:changed', (photo) => fsm.send('NEXT_PHOTO', photo));

  // back button click
  dom.backButton?.addEventListener('click', () => fsm.send('CLOSE_GALLERY'));

  // terms modal
  dom.termsLink?.addEventListener('click', () => fsm.send('OPEN_TERMS'));
  dom.termsModalClose?.addEventListener('click', closeTermsModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.termsModal?.hasAttribute('hidden')) {
      closeTermsModal();
    }
  });
}

function closeGalleryDirect() {
  dom.galleryContent?.classList.remove('active');
  dom.gallerySelector?.classList.remove('hidden');
  dom.siteIntro?.classList.remove('hidden');
  dom.termsFooter?.classList.remove('hidden');
  store.set('isGalleryOpen', false);
  // restore scroll
  const y = store.get('scrollPosition').homepageY || 0;
  window.scrollTo({ top: y, behavior: 'instant' });
}

function closeTermsModal() {
  dom.termsModal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
  history.back();
}