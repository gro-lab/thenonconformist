// ============================================
// COOKIES MODULE — GDPR consent, strategy pattern
// 6 near-identical handlers → 1 delegated handler + strategies map
// ============================================

import { store } from './store.js';
import { bus } from './event-bus.js';
import { dom } from './dom-elements.js';
import { initFirebase, fetchAllLikes, teardownFirebase } from './firebase.js';

let controller; // AbortController for lifecycle cleanup

// ── Preference Builders (Strategy Pattern) ───

function buildPrefs(overrides = {}) {
  return {
    essential: true,
    functional: false,
    version: '1.0',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const strategies = {
  acceptAll: () => buildPrefs({ functional: true }),
  rejectAll: () => buildPrefs({ functional: false }),
  save:      () => buildPrefs({
    functional: dom.functionalCheckbox?.checked ?? false,
  }),
};

// ── Apply / Persist ──────────────────────────

function persistPrefs(prefs) {
  localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
}

async function applyPrefs(prefs) {
  console.log('🍪 Applying cookie preferences:', prefs);

  if (prefs.functional) {
    store.set('functionalCookiesEnabled', true);
    await initFirebase();
    await fetchAllLikes();
  } else {
    store.set('functionalCookiesEnabled', false);
    teardownFirebase();
  }
}

// ── Banner / Modal UI ────────────────────────

function showBanner() {
  dom.cookieBanner?.removeAttribute('hidden');
}

function hideBanner() {
  dom.cookieBanner?.setAttribute('hidden', '');
}

function showSettingsModal() {
  // Pre-fill checkbox from saved prefs
  const saved = localStorage.getItem('cookiePreferences');
  if (saved) {
    const prefs = JSON.parse(saved);
    if (dom.functionalCheckbox) dom.functionalCheckbox.checked = prefs.functional || false;
  }
  dom.cookieSettingsModal?.removeAttribute('hidden');
}

function hideSettingsModal() {
  dom.cookieSettingsModal?.setAttribute('hidden', '');
}

// ── Consent Handler (single delegated) ───────

async function handleConsent(action, source) {
  const strategy = strategies[action];
  if (!strategy) return;

  const prefs = strategy();
  persistPrefs(prefs);

  hideBanner();
  if (source === 'modal') hideSettingsModal();

  await applyPrefs(prefs);
  location.reload();
}

// ── Init ─────────────────────────────────────

export function initCookieBanner() {
  // Check for existing saved preferences
  const saved = localStorage.getItem('cookiePreferences');

  if (saved) {
    const prefs = JSON.parse(saved);
    // Apply without reload — just set the flag
    if (prefs.functional) {
      store.set('functionalCookiesEnabled', true);
    }
  } else {
    showBanner();
  }
}

export function initCookieListeners() {
  controller = new AbortController();
  const { signal } = controller;

  // Banner buttons
  dom.cookieAcceptBtn?.addEventListener('click', () =>
    handleConsent('acceptAll', 'banner'), { signal });

  dom.cookieRejectBtn?.addEventListener('click', () =>
    handleConsent('rejectAll', 'banner'), { signal });

  dom.cookieSettingsBtn?.addEventListener('click', () => {
    hideBanner();
    showSettingsModal();
  }, { signal });

  // Settings modal buttons
  dom.cookieSaveBtn?.addEventListener('click', () =>
    handleConsent('save', 'modal'), { signal });

  dom.cookieAcceptAllBtn?.addEventListener('click', () =>
    handleConsent('acceptAll', 'modal'), { signal });

  dom.cookieRejectAllBtn?.addEventListener('click', () =>
    handleConsent('rejectAll', 'modal'), { signal });

  // Settings modal close
  dom.cookieModalClose?.addEventListener('click', hideSettingsModal, { signal });

  // Floating cookie button
  dom.cookieFloatBtn?.addEventListener('click', showSettingsModal, { signal });
}

export function destroyCookies() {
  controller?.abort();
}
