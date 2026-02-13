// js/modules/cookies.js
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';
import { initFirebase, teardownFirebase } from './firebase.js';

const DEFAULT_PREFS = {
  essential: true,
  functional: false,
  version: '1.0'
};

const strategies = {
  acceptAll: () => ({ ...DEFAULT_PREFS, functional: true }),
  rejectAll: () => ({ ...DEFAULT_PREFS, functional: false }),
  save: () => ({
    ...DEFAULT_PREFS,
    functional: dom.functionalCheckbox?.checked || false
  }),
  settings: () => null
};

const loadSavedPreferences = () => {
  try {
    const saved = localStorage.getItem('cookiePreferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      store.set('cookiePreferences', prefs);
      store.set('functionalCookiesEnabled', prefs.functional === true);
      return prefs;
    }
  } catch (e) {
    errorHandler.handle(e, { context: 'loading cookie prefs' });
  }
  return null;
};

const applyPreferences = withErrorHandling(async (prefs) => {
  if (!prefs) return;

  store.set('cookiePreferences', prefs);
  store.set('functionalCookiesEnabled', prefs.functional);

  if (prefs.functional) {
    await initFirebase();
  } else {
    teardownFirebase();
  }

  bus.emit('consent:updated', prefs);
}, { module: 'cookies' });

const savePreferences = withErrorHandling(async (prefs) => {
  if (!prefs) return;
  localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
  await applyPreferences(prefs);
  if (dom.cookieBanner) dom.cookieBanner.hidden = true;
  if (dom.cookieModal) dom.cookieModal.hidden = true;
  bus.emit('consent:applied', prefs);
}, { module: 'cookies' });

// Open cookie modal with history push
const openCookieModal = () => {
  if (store.get('isCookieModalOpen')) return;
  history.pushState({ page: 'cookie' }, '', window.location.href);
  store.set('isCookieModalOpen', true);
  if (dom.cookieModal) {
    dom.cookieModal.hidden = false;
    // Sync checkbox with current state
    if (dom.functionalCheckbox) {
      dom.functionalCheckbox.checked = store.get('functionalCookiesEnabled');
    }
  }
};

// Close cookie modal (called by popstate or close button)
export const closeCookieModal = () => {
  if (!store.get('isCookieModalOpen')) return;
  store.set('isCookieModalOpen', false);
  if (dom.cookieModal) dom.cookieModal.hidden = true;
};

const handleConsentClick = (e) => {
  const btn = e.target.closest('[data-consent]');
  if (!btn) return;

  const action = btn.dataset.consent;
  const source = btn.dataset.source || 'unknown';
  const strategy = strategies[action];
  if (!strategy) return;

  const prefs = strategy();

  if (prefs) {
    savePreferences(prefs);
  } else if (action === 'settings') {
    // Open settings modal via history-aware method
    openCookieModal();
    if (dom.cookieBanner) dom.cookieBanner.hidden = true;
  }
};

const setupEventListeners = () => {
  const signal = store.get('abortController')?.signal;

  dom.cookieUi?.addEventListener('click', handleConsentClick, { signal });
  dom.cookieModalUi?.addEventListener('click', handleConsentClick, { signal });

  // Floating button opens modal with history
  dom.cookieFloatBtn?.addEventListener('click', openCookieModal, { signal });

  // Modal close button (X) triggers history back
  dom.cookieModalClose?.addEventListener('click', () => {
    history.back();
  }, { signal });

  // Click outside modal content closes via history back
  dom.cookieModal?.addEventListener('click', (e) => {
    if (e.target === dom.cookieModal) history.back();
  }, { signal });

  // Handle popstate for cookie modal
  window.addEventListener('popstate', (e) => {
    if (store.get('isCookieModalOpen')) {
      closeCookieModal();
    }
  }, { signal });
};

export async function initCookieConsent() {
  console.log('🍪 Initializing cookie consent...');

  const saved = loadSavedPreferences();

  if (saved) {
    await applyPreferences(saved);
  } else {
    if (dom.cookieBanner) dom.cookieBanner.hidden = false;
  }

  setupEventListeners();

  return {
    hasFunctionalConsent: () => store.get('functionalCookiesEnabled')
  };
}
