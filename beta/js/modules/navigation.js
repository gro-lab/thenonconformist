// ============================================
// NAVIGATION MODULE — History API + Terms modal
// Handles browser back/forward, terms modal open/close.
// ============================================

import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { closeModalDirect } from './modal.js';
import { closeGalleryDirect } from './gallery.js';

let controller;

// ── History API helpers ──────────────────────

function pushHomepageTrap() {
  history.replaceState({ type: 'home' }, '', window.location.pathname);
}

// ── Terms modal ──────────────────────────────

function openTermsModal() {
  if (dom.termsModal) {
    dom.termsModal.hidden = false;
    if (!store.get('isPopstateClosing')) {
      history.pushState({ type: 'terms' }, '', '#terms');
    }
  }
}

function closeTermsModal() {
  if (dom.termsModal) {
    dom.termsModal.hidden = true;
    if (!store.get('isPopstateClosing')) {
      history.back();
    }
  }
}

function closeTermsModalDirect() {
  if (dom.termsModal) dom.termsModal.hidden = true;
}

// ── Popstate handler ─────────────────────────

function handlePopstate(e) {
  // Priority order: modal → terms → gallery → homepage

  // 1. Image modal open → close it
  if (store.get('isModalOpen')) {
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

// ── Init / Destroy ───────────────────────────

export function initNavigation() {
  controller = new AbortController();
  const { signal } = controller;

  // Set initial homepage trap
  pushHomepageTrap();

  // Listen for browser back / forward
  window.addEventListener('popstate', handlePopstate, { signal });

  // Terms modal: open
  dom.termsLink?.addEventListener('click', openTermsModal, { signal });

  // Terms modal: close via × button
  dom.termsModalClose?.addEventListener('click', closeTermsModal, { signal });

  // Terms modal: close via click outside
  dom.termsModal?.addEventListener(
    'click',
    (e) => {
      if (e.target === dom.termsModal) closeTermsModal();
    },
    { signal }
  );
}

export function destroyNavigation() {
  controller?.abort();
}
