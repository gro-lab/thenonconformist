// ============================================
// NAVIGATION MODULE — History API + Terms modal
// Manages browser back/swipe behaviour and history state
// ============================================

import { store } from './store.js';
import { bus } from './event-bus.js';
import { dom } from './dom-elements.js';
import { closeGalleryDirect } from './gallery.js';
import { closeModalDirect } from './modal.js';

let controller; // AbortController for lifecycle cleanup

// ── Homepage Trap ────────────────────────────
// Push a pair of states so browser back/swipe cannot leave the site

function pushHomepageTrap() {
  history.replaceState({ page: 'home' }, '', window.location.href);
  history.pushState({ page: 'home-trap' }, '', window.location.href);
}

// ── Terms Modal ──────────────────────────────

function openTermsModal() {
  history.pushState({ page: 'terms' }, '', window.location.href);
  dom.termsModal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function closeTermsModalDirect() {
  dom.termsModal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
}

function closeTermsModal() {
  if (store.get('isPopstateClosing')) {
    closeTermsModalDirect();
    return;
  }
  history.back();
}

// ── Popstate Handler ─────────────────────────

function handlePopstate() {
  // 1. Image modal open → close it
  if (!dom.modal?.hasAttribute('hidden')) {
    store.set('isPopstateClosing', true);
    closeModalDirect();
    store.set('isPopstateClosing', false);
    return;
  }

  // 2. Terms modal open → close it
  if (dom.termsModal && !dom.termsModal.hasAttribute('hidden')) {
    store.set('isPopstateClosing', true);
    closeTermsModalDirect();
    store.set('isPopstateClosing', false);
    return;
  }

  // 3. Gallery open → close it
  if (dom.galleryContent?.classList.contains('active')) {
    store.set('isPopstateClosing', true);
    closeGalleryDirect();
    store.set('isPopstateClosing', false);
    pushHomepageTrap();
    return;
  }

  // 4. On homepage → re-push trap
  pushHomepageTrap();
}

// ── Init ─────────────────────────────────────

export function initNavigation() {
  controller = new AbortController();
  const { signal } = controller;

  // Set initial homepage trap
  pushHomepageTrap();

  // Listen for browser back / forward
  window.addEventListener('popstate', handlePopstate, { signal });

  // Terms modal: open
  dom.termsLink?.addEventListener('click', openTermsModal, { signal });

  // Terms modal: close via X button
  dom.termsModalClose?.addEventListener('click', closeTermsModal, { signal });

  // Terms modal: close via click outside
  dom.termsModal?.addEventListener('click', (e) => {
    if (e.target === dom.termsModal) closeTermsModal();
  }, { signal });
}

export function destroyNavigation() {
  controller?.abort();
}
