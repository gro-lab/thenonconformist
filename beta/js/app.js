// js/app.js
import { store } from './lib/store.js';
import { bus } from './lib/event-bus.js';
import { errorHandler } from './lib/error-handler.js';
import { initCookieConsent } from './modules/cookies.js';
import { initFirebase, teardownFirebase } from './modules/firebase.js'; // will be triggered by consent
import { initGallery, openGallery, closeGallery } from './modules/gallery.js';
import { initModal, closeModal } from './modules/modal.js';
import { initNavigation } from './modules/navigation.js';
import { NAV_EVENTS } from './lib/navigation-fsm.js';

// Also import terms modal handler (simple)
import { initTermsModal } from './modules/terms.js'; // we'll add this small module

// Ensure DOM is ready
async function bootstrap() {
    try {
        // 1. Cookie consent (restores preferences, may enable Firebase)
        initCookieConsent();

        // 2. Navigation FSM & History
        initNavigation();

        // 3. Gallery (loads manifest, builds UI)
        await initGallery();

        // 4. Modal
        initModal();

        // 5. Terms modal (simple)
        initTermsModal();

        // 6. Wire FSM actions to actual UI functions
        bus.on(NAV_EVENTS.CLOSE_GALLERY, () => closeGallery({ skipHistory: true }));
        bus.on(NAV_EVENTS.CLOSE_PHOTO, () => closeModal({ skipHistory: true }));

        console.log('✅ App initialized');
    } catch (err) {
        errorHandler.handle(err, { context: 'bootstrap' });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}