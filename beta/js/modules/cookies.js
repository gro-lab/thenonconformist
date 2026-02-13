// js/modules/cookies.js
// GDPR cookie consent module with strategy pattern and delegation
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';
import { teardownFirebase, initFirebase } from './firebase.js'; // will be imported later

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

// Apply preferences (enable/disable features)
async function applyPreferences(prefs) {
  if (!prefs) return;
  
  store.set('cookiePreferences', prefs);
  store.set('functionalCookiesEnabled', prefs.functional);
  
  if (prefs.functional) {
    // Initialize Firebase if not already
    await initFirebase();
  } else {
    // Tear down Firebase if it was running
    teardownFirebase();
  }
  
  // Notify other modules
  bus.emit('consent:updated', prefs);
}

// Save preferences to localStorage and apply
const savePreferences = withErrorHandling(async (prefs) => {
  if (!prefs) return;
  
  localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
  await applyPreferences(prefs);
  
  // Hide relevant UI
  if (dom.cookieBanner) dom.cookieBanner.hidden = true;
  if (dom.cookieModal) dom.cookieModal.hidden = true;
  
  // Reload to re-fetch likes etc. if needed (optional, but original did)
  // We'll do a soft reset by re-initializing gallery data
  bus.emit('consent:applied', prefs);
}, { module: 'cookies' });

// Initialize event listeners (delegation)
function setupEventListeners() {
  const signal = store.get('abortController')?.signal;
  
  // Cookie banner and modal UI both handled via delegation
  dom.cookieUi?.addEventListener('click', handleConsentClick, { signal });
  dom.cookieModalUi?.addEventListener('click', handleConsentClick, { signal });
  
  // Floating button opens modal
  dom.cookieFloatBtn?.addEventListener('click', () => {
    // Sync checkbox with current state
    if (dom.functionalCheckbox) {
      dom.functionalCheckbox.checked = store.get('functionalCookiesEnabled');
    }
    if (dom.cookieModal) dom.cookieModal.hidden = false;
  }, { signal });
  
  // Modal close button
  dom.cookieModalClose?.addEventListener('click', () => {
    if (dom.cookieModal) dom.cookieModal.hidden = true;
  }, { signal });
}

function handleConsentClick(e) {
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
    // Open settings modal
    if (dom.functionalCheckbox) {
      dom.functionalCheckbox.checked = store.get('functionalCookiesEnabled');
    }
    if (dom.cookieBanner) dom.cookieBanner.hidden = true;
    if (dom.cookieModal) dom.cookieModal.hidden = false;
  }
}

// Public init function
export async function initCookieConsent() {
  console.log('🍪 Initializing cookie consent...');
  
  const saved = loadSavedPreferences();
  
  if (saved) {
    await applyPreferences(saved);
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