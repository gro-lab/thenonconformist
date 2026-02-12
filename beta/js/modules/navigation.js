// js/modules/navigation.js
import { navFSM, NAV_EVENTS } from '../lib/navigation-fsm.js';
import { bus } from '../lib/event-bus.js';
import { store } from '../lib/store.js';

function pushHomepageTrap() {
    history.replaceState({ page: 'home' }, '', window.location.href);
    history.pushState({ page: 'home-trap' }, '', window.location.href);
}

export function initNavigation() {
    // Initial trap
    pushHomepageTrap();

    // Handle popstate (back button, swipe gesture)
    window.addEventListener('popstate', (e) => {
        const state = e.state || {};

        // If terms modal is open, close it directly
        const termsModal = document.getElementById('terms-modal');
        if (termsModal && !termsModal.hidden) {
            termsModal.hidden = true;
            document.body.style.overflow = 'auto';
            pushHomepageTrap(); // restore trap
            return;
        }

        // Delegate to FSM
        navFSM.send(NAV_EVENTS.POPSTATE, state);
    });

    // Sync store with FSM state
    navFSM.on(({ current }) => {
        store.set('navState', current);
    });

    // When we intentionally navigate home, push the trap again
    bus.on(NAV_EVENTS.NAVIGATE_HOME, pushHomepageTrap);
}