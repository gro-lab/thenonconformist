// ============================================
// COOKIES MODULE — GDPR consent management
// Strategy pattern: 6 handlers → 1 delegated handler
// ============================================

import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { initFirebase, teardownFirebase, fetchAllLikes } from './firebase.js';

let controller;

// ── Consent strategies ───────────────────────

const strategies = {
  acceptAll: () => ({ essential: true, functional: true }),
  rejectAll: () => ({ essential: true, functional: false }),
  save: () => ({
    essential: true,
    functional: dom.functionalCheckbox?.checked ?? false,
  }),
};

// ── Core consent logic ───────────────────────

function applyConsent(prefs, source) {
  localStorage.setItem('cookieConsent', JSON.stringify(prefs));
  store.set('functionalCookiesEnabled', prefs.functional);

  // Hide banner
  if (dom.cookieBanner) dom.cookieBanner.hidden = true;

  // Hide settings modal if that's where the action came from
  if (source === 'modal' && dom.cookieSettingsModal) {
    dom.cookieSettingsModal.hidden = true;
  }

  // Show floating cookie button for future settings access
  if (dom.cookieFloatBtn) dom.cookieFloatBtn.hidden = false;

  if (prefs.functional) {
    enableFunctionalFeatures();
  } else {
    disableFunctionalFeatures();
  }

  bus.emit('consent:updated', prefs);
  console.log('🍪 Consent applied:', prefs);
}

async function enableFunctionalFeatures() {
  try {
    await initFirebase();
    await fetchAllLikes();
    bus.emit('gallery:covers:refresh');
    bus.emit('gallery:reload');
    console.log('✅ Functional features enabled');
  } catch (error) {
    console.error('❌ Error enabling functional features:', error);
  }
}

function disableFunctionalFeatures() {
  teardownFirebase();
  localStorage.removeItem('likedImages');
  console.log('🚫 Functional features disabled');
}

// ── Cookie settings modal ────────────────────

function openCookieSettings() {
  if (dom.cookieSettingsModal) {
    // Sync checkbox with current state
    if (dom.functionalCheckbox) {
      dom.functionalCheckbox.checked = store.get('functionalCookiesEnabled');
    }
    dom.cookieSettingsModal.hidden = false;
  }
}

function closeCookieSettings() {
  if (dom.cookieSettingsModal) {
    dom.cookieSettingsModal.hidden = true;
  }
}

// ── Init: check existing consent or show banner ──

export function initCookieBanner() {
  const saved = localStorage.getItem('cookieConsent');

  if (saved) {
    try {
      const prefs = JSON.parse(saved);
      store.set('functionalCookiesEnabled', prefs.functional);
      if (dom.cookieFloatBtn) dom.cookieFloatBtn.hidden = false;

      if (prefs.functional) {
        enableFunctionalFeatures();
      }

      console.log('🍪 Restored consent:', prefs);
    } catch {
      localStorage.removeItem('cookieConsent');
      showBanner();
    }
  } else {
    showBanner();
  }
}

function showBanner() {
  if (dom.cookieBanner) dom.cookieBanner.hidden = false;
}

// ── Bind all listeners ───────────────────────

export function initCookieListeners() {
  controller = new AbortController();
  const { signal } = controller;

  // Banner buttons
  dom.cookieAcceptBtn?.addEventListener(
    'click',
    () => applyConsent(strategies.acceptAll(), 'banner'),
    { signal }
  );
  dom.cookieRejectBtn?.addEventListener(
    'click',
    () => applyConsent(strategies.rejectAll(), 'banner'),
    { signal }
  );
  dom.cookieSettingsBtn?.addEventListener('click', openCookieSettings, {
    signal,
  });

  // Settings modal buttons
  dom.cookieAcceptAllBtn?.addEventListener(
    'click',
    () => applyConsent(strategies.acceptAll(), 'modal'),
    { signal }
  );
  dom.cookieRejectAllBtn?.addEventListener(
    'click',
    () => applyConsent(strategies.rejectAll(), 'modal'),
    { signal }
  );
  dom.cookieSaveBtn?.addEventListener(
    'click',
    () => applyConsent(strategies.save(), 'modal'),
    { signal }
  );

  // Settings modal close
  dom.cookieModalClose?.addEventListener('click', closeCookieSettings, {
    signal,
  });
  dom.cookieSettingsModal?.addEventListener(
    'click',
    (e) => {
      if (e.target === dom.cookieSettingsModal) closeCookieSettings();
    },
    { signal }
  );

  // Floating cookie button to re-open settings
  dom.cookieFloatBtn?.addEventListener('click', openCookieSettings, {
    signal,
  });
}

export function destroyCookies() {
  controller?.abort();
}