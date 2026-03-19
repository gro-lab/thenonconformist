// js/modules/cookies.js
// GDPR cookie consent module with strategy pattern, delegation, expiration & audit log
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';

let abortController = null;

// Consent configuration
const CONSENT_EXPIRY_DAYS = 180;
const CONSENT_VERSION = '1.0';   // bump when consent UI changes
const POLICY_VERSION = '1.0';    // bump when privacy policy changes

// Default preferences
const DEFAULT_PREFS = {
  essential: true,
  functional: false
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

// Build a complete consent record with audit metadata
function buildConsentRecord(prefs) {
  return {
    ...prefs,
    timestamp: Date.now(),
    consentVersion: CONSENT_VERSION,
    policyVersion: POLICY_VERSION
  };
}

// Check if a consent record has expired
function isConsentExpired(record) {
  if (!record || !record.timestamp) return true;
  const ageMs = Date.now() - record.timestamp;
  const expiryMs = CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return ageMs > expiryMs;
}

// Check if consent versions are outdated (UI or policy changed)
function isConsentOutdated(record) {
  if (!record) return true;
  return record.consentVersion !== CONSENT_VERSION ||
         record.policyVersion !== POLICY_VERSION;
}

// Load saved preferences from localStorage
function loadSavedPreferences() {
  try {
    const saved = localStorage.getItem('cookiePreferences');
    if (saved) {
      const prefs = JSON.parse(saved);

      // Check expiration
      if (isConsentExpired(prefs)) {
        console.log('⏰ Consent has expired — requesting renewal');
        // Pause functional cookies but don't delete the record yet
        store.set('functionalCookiesEnabled', false);
        store.set('cookiePreferences', null);
        store.set('consentExpired', true);
        return null;
      }

      // Check if consent or policy version changed
      if (isConsentOutdated(prefs)) {
        console.log('📋 Consent or policy version outdated — requesting renewal');
        store.set('functionalCookiesEnabled', false);
        store.set('cookiePreferences', null);
        store.set('consentExpired', true);
        return null;
      }

      store.set('cookiePreferences', prefs);
      store.set('functionalCookiesEnabled', prefs.functional === true);
      store.set('consentExpired', false);
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
  store.set('consentExpired', false);
}

// FIX: Dim the floating cookie button once consent has been given.
// The button stays accessible but shrinks back to a quiet indicator —
// it's done its job and shouldn't compete for attention with the photos.
const dimFloatButton = () => {
  if (dom.cookieFloatBtn) {
    dom.cookieFloatBtn.classList.add('cookie-consent-given');
  }
};

// Save preferences to localStorage and apply
const savePreferences = withErrorHandling(async (prefs) => {
  if (!prefs) return;

  // Wrap with audit metadata
  const record = buildConsentRecord(prefs);
  
  localStorage.setItem('cookiePreferences', JSON.stringify(record));
  applyPreferences(record);
  
  // Hide relevant UI
  if (dom.cookieBanner) dom.cookieBanner.hidden = true;
  closeCookieModal();

  // FIX: Dim the float button — the user has made their choice
  dimFloatButton();
  
  // Notify firebase (which will init/teardown, then emit consent:applied)
  bus.emit('consent:updated', record);
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

// Update banner text for renewal vs first-time
function updateBannerText(isRenewal) {
  const bannerHeading = dom.cookieBanner?.querySelector('h3');
  const bannerText = dom.cookieBanner?.querySelector('p');
  
  if (isRenewal && bannerHeading && bannerText) {
    bannerHeading.textContent = 'Your consent has expired';
    bannerText.innerHTML = 'Your previous privacy preferences have expired after 180 days. Please renew your choices to continue using features such as <span style="color: #f28c28">image likes</span>.';
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
  
  // Banner privacy policy link opens terms modal
  const bannerPrivacyLink = document.getElementById('banner-privacy-link');
  bannerPrivacyLink?.addEventListener('click', () => {
    bus.emit('terms:open');
  }, { signal });
  
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
    // FIX: Re-apply the dimmed state on page load — the user already gave
    // consent in a previous session so the button should start quiet.
    dimFloatButton();
    // Banner remains hidden (already hidden by CSS default)
  } else {
    // Show banner — check if this is a renewal
    const isRenewal = store.get('consentExpired') === true;
    updateBannerText(isRenewal);
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
