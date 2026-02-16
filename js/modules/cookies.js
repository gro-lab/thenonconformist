// js/modules/cookies.js
// GDPR cookie consent module with strategy pattern and delegation
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';

let abortController = null;

// Default preferences
const DEFAULT_PREFS = {
  essential: true,
  functional: false,
  version: '1.0'
};

// Strategy map: each action returns a preferences object
const strategies = {
  acceptAll: () => ({
    ...DEFAULT_PREFS,
    functional: true
  }),
  rejectAll: () => ({
    ...DEFAULT_PREFS,
    functional: false
  }),
  save: () => ({
    ...DEFAULT_PREFS,
    functional: dom.functionalCheckbox?.checked || false
  }),
  settings: () => {
    // Just open modal, no prefs change
    return null;
  }
};

// Load saved preferences from localStorage
function loadSavedPreferences() {
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
}

// Apply preferences (set store values only — firebase reacts via bus)
function applyPreferences(prefs) {
  if (!prefs) return;
  store.set('cookiePreferences', prefs);
  store.set('functionalCookiesEnabled', prefs.functional);
}

// Save preferences to localStorage and apply
const savePreferences = withErrorHandling(async (prefs) => {
  if (!prefs) return;
  
  localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
  applyPreferences(prefs);
  
  // Hide relevant UI
  if (dom.cookieBanner) dom.cookieBanner.hidden = true;
  closeCookieModal();
  
  // Notify firebase (which will init/teardown, then emit consent:applied)
  bus.emit('consent:updated', prefs);
}, { module: 'cookies' });

// Close cookie settings modal
export const closeCookieModal = () => {
  if (dom.cookieModal) dom.cookieModal.hidden = true;
  store.set('isCookieModalOpen', false);
};

// Open cookie settings modal
const openCookieModal = () => {
  if (dom.functionalCheckbox) {
    dom.functionalCheckbox.checked = store.get('functionalCookiesEnabled');
  }
  if (dom.cookieModal) dom.cookieModal.hidden = false;
  store.set('isCookieModalOpen', true);
  history.pushState({ page: 'cookie-settings' }, '', window.location.href);
};

function handleConsentClick(e) {
  const btn = e.target.closest('[data-consent]');
  if (!btn) return;
  
  const action = btn.dataset.consent;
  
  const strategy = strategies[action];
  if (!strategy) return;
  
  const prefs = strategy();
  
  if (prefs) {
    savePreferences(prefs);
  } else if (action === 'settings') {
    // Hide banner, open settings modal
    if (dom.cookieBanner) dom.cookieBanner.hidden = true;
    openCookieModal();
  }
}

// Initialize event listeners (delegation)
function setupEventListeners() {
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;
  
  // Cookie banner and modal UI both handled via delegation
  dom.cookieUi?.addEventListener('click', handleConsentClick, { signal });
  dom.cookieModalUi?.addEventListener('click', handleConsentClick, { signal });
  
  // Floating button opens modal
  dom.cookieFloatBtn?.addEventListener('click', () => {
    openCookieModal();
  }, { signal });
  
  // Modal close button
  dom.cookieModalClose?.addEventListener('click', () => {
    closeCookieModal();
  }, { signal });
}

// Public init function
export async function initCookieConsent() {
  console.log('🍪 Initializing cookie consent...');
  
  const saved = loadSavedPreferences();
  
  if (saved) {
    applyPreferences(saved);
    // Banner remains hidden (already hidden by CSS default)
  } else {
    // Show banner if no preferences saved
    if (dom.cookieBanner) dom.cookieBanner.hidden = false;
  }
  
  setupEventListeners();
  
  // Expose a method to re-check consent (for modules that need it)
  return {
    hasFunctionalConsent: () => store.get('functionalCookiesEnabled')
  };
}

// Cleanup
export const destroyCookieConsent = () => {
  abortController?.abort();
  abortController = null;
};
