import { dom } from '../dom-elements.js';
import { bus } from '../lib/event-bus.js';
import { store } from '../lib/store.js';
import { initFirebase, teardownFirebase } from './firebase.js';

const PREFS_KEY = 'cookiePreferences';
const DEFAULT_PREFS = { essential: true, functional: false, version: '1.0' };

const strategies = {
  acceptAll: () => ({ ...DEFAULT_PREFS, functional: true }),
  rejectAll: () => ({ ...DEFAULT_PREFS, functional: false }),
  save: () => ({
    ...DEFAULT_PREFS,
    functional: document.getElementById('functional-cookies')?.checked ?? false,
  }),
};

export function initCookieConsent() {
  const saved = localStorage.getItem(PREFS_KEY);
  if (saved) {
    const prefs = JSON.parse(saved);
    applyPrefs(prefs);
  } else {
    dom.cookieBanner?.removeAttribute('hidden');
  }

  // 🎯 single delegated listener for all consent buttons
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-consent]');
    if (!btn) return;
    const prefs = strategies[btn.dataset.consent]?.() ?? DEFAULT_PREFS;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    await applyPrefs(prefs);

    // close relevant UI
    if (btn.closest('#cookie-banner')) dom.cookieBanner?.setAttribute('hidden', '');
    if (btn.closest('#cookie-settings-modal')) dom.cookieModal?.setAttribute('hidden', '');
  });
}

async function applyPrefs(prefs) {
  store.set('functionalCookies', prefs.functional);
  if (prefs.functional) {
    await initFirebase();
    bus.emit('consent:functional', true);
  } else {
    teardownFirebase();
    bus.emit('consent:functional', false);
  }
}