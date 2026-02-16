// js/modules/cookies.js
// GDPR cookie consent module with strategy pattern, delegation,
// consent expiration, and audit-grade proof of consent
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';

let abortController = null;

// ─── GDPR Configuration ───────────────────────────────────────────
const CONSENT_VERSION = '1.1';          // Bump when consent UI/text changes
const POLICY_VERSION  = '2025-02-16';   // Bump when privacy policy changes
const CONSENT_MAX_AGE_DAYS = 180;       // Re-ask after 6 months (GDPR guidance)

// Default preferences — functional OFF by default (privacy by design)
const DEFAULT_PREFS = {
  essential: true,
  functional: false,
};

// ─── Strategy map: each action returns a preferences object ───────
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
  settings: () => null // Just open modal, no prefs change
};

// ─── Consent expiration check ─────────────────────────────────────
function isConsentExpired(prefs) {
  if (!prefs || !prefs.timestamp) return true;

  const consentDate = new Date(prefs.timestamp);
  if (isNaN(consentDate.getTime())) return true;

  const now = new Date();
  const diffMs = now - consentDate;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= CONSENT_MAX_AGE_DAYS;
}

// Check if consent or policy version changed since last consent
function isConsentVersionOutdated(prefs) {
  if (!prefs) return true;
  return prefs.consentVersion !== CONSENT_VERSION ||
         prefs.policyVersion !== POLICY_VERSION;
}

// ─── Build consent record (audit-grade proof) ─────────────────────
function buildConsentRecord(basePrefs) {
  return {
    ...basePrefs,
    consentVersion: CONSENT_VERSION,
    policyVersion: POLICY_VERSION,
    timestamp: new Date().toISOString()
  };
}

// ─── Load saved preferences from localStorage ────────────────────
function loadSavedPreferences() {
  try {
    const saved = localStorage.getItem('cookiePreferences');
    if (!saved) return null;

    const prefs = JSON.parse(saved);

    // Check expiration — if expired, treat functional as disabled
    // but DON'T delete prefs yet (we'll show a renewal banner)
    if (isConsentExpired(prefs) || isConsentVersionOutdated(prefs)) {
      console.log('🕐 Consent expired or version outdated — requesting renewal');
      // Disable functional features until re-consent
      store.set('cookiePreferences', prefs);
      store.set('functionalCookiesEnabled', false);
      store.set('consentNeedsRenewal', true);
      return null; // Trigger banner display
    }

    store.set('cookiePreferences', prefs);
    store.set('functionalCookiesEnabled', prefs.functional === true);
    store.set('consentNeedsRenewal', false);
    return prefs;
  } catch (e) {
    errorHandler.handle(e, { context: 'loading cookie prefs' });
  }
  return null;
}

// ─── Apply preferences (set store values only) ───────────────────
function applyPreferences(prefs) {
  if (!prefs) return;
  store.set('cookiePreferences', prefs);
  store.set('functionalCookiesEnabled', prefs.functional);
  store.set('consentNeedsRenewal', false);
}

// ─── Save preferences to localStorage and apply ──────────────────
const savePreferences = withErrorHandling(async (basePrefs) => {
  if (!basePrefs) return;

  // Build audit-grade consent record
  const fullPrefs = buildConsentRecord(basePrefs);

  localStorage.setItem('cookiePreferences', JSON.stringify(fullPrefs));
  applyPreferences(fullPrefs);

  // Hide relevant UI
  if (dom.cookieBanner) dom.cookieBanner.hidden = true;
  closeCookieModal();

  // Notify firebase (which will init/teardown, then emit consent:applied)
  bus.emit('consent:updated', fullPrefs);
}, { module: 'cookies' });

// ─── Close cookie settings modal ─────────────────────────────────
export const closeCookieModal = () => {
  if (dom.cookieModal) dom.cookieModal.hidden = true;
  store.set('isCookieModalOpen', false);
};

// ─── Open cookie settings modal ──────────────────────────────────
const openCookieModal = () => {
  if (dom.functionalCheckbox) {
    dom.functionalCheckbox.checked = store.get('functionalCookiesEnabled');
  }
  if (dom.cookieModal) dom.cookieModal.hidden = false;
  store.set('isCookieModalOpen', true);
  history.pushState({ page: 'cookie-settings' }, '', window.location.href);
};

// ─── Delegated consent click handler ─────────────────────────────
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
    if (dom.cookieBanner) dom.cookieBanner.hidden = true;
    openCookieModal();
  }
}

// ─── Initialize event listeners (delegation) ─────────────────────
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

// ─── Update banner text for renewal vs first visit ────────────────
function updateBannerText() {
  const isRenewal = store.get('consentNeedsRenewal');
  const bannerTitle = dom.cookieBanner?.querySelector('h3');
  const bannerDesc = dom.cookieBanner?.querySelector('p');

  if (isRenewal && bannerTitle && bannerDesc) {
    bannerTitle.textContent = 'Your consent has expired';
    bannerDesc.innerHTML =
      'Your previous privacy preferences have expired. Please review and renew ' +
      'your choices to continue using features such as ' +
      '<span style="color: #f28c28">image likes</span>.';
  }
}

// ─── Public init function ─────────────────────────────────────────
export async function initCookieConsent() {
  console.log('🍪 Initializing cookie consent...');

  const saved = loadSavedPreferences();

  if (saved) {
    applyPreferences(saved);
    // Banner remains hidden (already hidden by CSS default)
  } else {
    // Show banner — either first visit or expired/outdated consent
    updateBannerText();
    if (dom.cookieBanner) dom.cookieBanner.hidden = false;
  }

  setupEventListeners();

  return {
    hasFunctionalConsent: () => store.get('functionalCookiesEnabled')
  };
}

// ─── Cleanup ──────────────────────────────────────────────────────
export const destroyCookieConsent = () => {
  abortController?.abort();
  abortController = null;
};
