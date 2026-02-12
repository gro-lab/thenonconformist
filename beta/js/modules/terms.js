// js/modules/terms.js
import { dom } from '../dom-elements.js';
import { bus } from '../lib/event-bus.js';
import { NAV_EVENTS } from '../lib/navigation-fsm.js';

export function initTermsModal() {
    dom.termsLink?.addEventListener('click', () => {
        history.pushState({ page: 'terms' }, '', window.location.href);
        dom.termsModal?.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
    });

    dom.termsModalClose?.addEventListener('click', closeTermsModal);
    dom.termsModal?.addEventListener('click', (e) => {
        if (e.target === dom.termsModal) closeTermsModal();
    });
}

function closeTermsModal() {
    if (dom.termsModal) dom.termsModal.hidden = true;
    document.body.style.overflow = 'auto';
    history.back(); // will trigger popstate -> we handle in navigation.js
}