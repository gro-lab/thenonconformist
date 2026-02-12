// js/modules/cookies.js
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { withErrorHandling } from '../lib/error-handler.js';

const COOKIE_PREFS_KEY = 'cookiePreferences';

const defaultPrefs = {
    essential: true,
    functional: false,
    version: '1.0',
    timestamp: null
};

const strategies = {
    acceptAll: () => ({ ...defaultPrefs, functional: true, timestamp: new Date().toISOString() }),
    rejectAll: () => ({ ...defaultPrefs, functional: false, timestamp: new Date().toISOString() }),
    save: () => {
        const functional = dom.functionalCheckbox?.checked || false;
        return { ...defaultPrefs, functional, timestamp: new Date().toISOString() };
    }
};

function applyPreferences(prefs) {
    store.set('cookiePreferences', prefs);
    store.set('functionalCookiesEnabled', prefs.functional);
    bus.emit('consent:functional', prefs.functional);
}

// ---------- UI Handlers ----------
function handleConsentClick(e) {
    const btn = e.target.closest('[data-consent]');
    if (!btn) return;

    const action = btn.dataset.consent;
    const source = btn.dataset.source;
    const prefs = strategies[action]?.() || defaultPrefs;

    localStorage.setItem(COOKIE_PREFS_KEY, JSON.stringify(prefs));
    applyPreferences(prefs);

    // Close appropriate UI
    if (dom.cookieBanner) dom.cookieBanner.hidden = true;
    if (source === 'modal' && dom.cookieSettingsModal) {
        dom.cookieSettingsModal.hidden = true;
    }
}

function openSettingsModal() {
    // Pre‑fill checkbox from current prefs
    const prefs = store.get('cookiePreferences') || defaultPrefs;
    if (dom.functionalCheckbox) dom.functionalCheckbox.checked = prefs.functional;
    if (dom.cookieSettingsModal) dom.cookieSettingsModal.hidden = false;
}

// ---------- Init / Teardown ----------
export function initCookieConsent() {
    // Restore saved preferences
    const saved = localStorage.getItem(COOKIE_PREFS_KEY);
    if (saved) {
        try {
            const prefs = JSON.parse(saved);
            applyPreferences(prefs);
        } catch (e) {
            // fallback: show banner
        }
    } else {
        // Show banner if no preferences saved
        if (dom.cookieBanner) dom.cookieBanner.hidden = false;
    }

    // ----- Event delegation for all consent buttons -----
    const cookieUI = document.getElementById('cookie-ui'); // wrap both banner and modal inside this container
    if (!cookieUI) {
        // Fallback: attach individually
        document.querySelectorAll('[data-consent]').forEach(btn => {
            btn.addEventListener('click', handleConsentClick);
        });
    } else {
        cookieUI.addEventListener('click', handleConsentClick);
    }

    // ----- Settings button (floating & banner) -----
    dom.cookieFloatBtn?.addEventListener('click', openSettingsModal);
    document.getElementById('cookie-settings-btn')?.addEventListener('click', openSettingsModal);

    // ----- Modal close -----
    document.getElementById('cookie-modal-close')?.addEventListener('click', () => {
        if (dom.cookieSettingsModal) dom.cookieSettingsModal.hidden = true;
    });
}

export function destroyCookieUI() {
    // Cleanup listeners if needed – but since we use delegation on #cookie-ui,
    // we can just remove the container or keep it; no global listeners to remove.
}