// js/lib/navigation-fsm.js
import { store } from './store.js';
import { bus } from './event-bus.js';

export const NAV_EVENTS = {
    OPEN_GALLERY: 'OPEN_GALLERY',
    OPEN_PHOTO: 'OPEN_PHOTO',
    CLOSE_GALLERY: 'CLOSE_GALLERY',
    CLOSE_PHOTO: 'CLOSE_PHOTO',
    POPSTATE: 'POPSTATE',
    NAVIGATE_HOME: 'NAVIGATE_HOME'
};

const actions = {
    pushGalleryState: (payload) => {
        history.pushState({ page: 'gallery', gallery: payload.galleryId }, '');
    },
    pushPhotoState: (payload) => {
        history.pushState({ page: 'modal', gallery: payload.galleryId }, '');
    },
    pushHomeState: () => {
        history.pushState({ page: 'home-trap' }, '');
    },
    renderHome: () => {
        bus.emit('ui:closeGallery', { skipHistory: true });
    },
    renderGallery: () => {
        bus.emit('ui:reopenGallery', { skipHistory: true });
    },
    replacePhotoState: (payload) => {
        history.replaceState({ page: 'modal', gallery: payload.galleryId }, '');
    }
};

const fsmDefinition = {
    initial: 'browsing',
    states: {
        browsing: {
            [NAV_EVENTS.OPEN_GALLERY]: { target: 'viewingGallery', action: actions.pushGalleryState },
            [NAV_EVENTS.OPEN_PHOTO]:   { target: 'viewingPhoto',   action: actions.pushPhotoState }
        },
        viewingGallery: {
            [NAV_EVENTS.OPEN_PHOTO]:   { target: 'viewingPhoto',   action: actions.pushPhotoState },
            [NAV_EVENTS.POPSTATE]:     { target: 'browsing',        action: actions.renderHome },
            [NAV_EVENTS.NAVIGATE_HOME]: { target: 'browsing',        action: actions.pushHomeState },
            [NAV_EVENTS.CLOSE_GALLERY]: { target: 'browsing',        action: actions.renderHome }
        },
        viewingPhoto: {
            [NAV_EVENTS.CLOSE_PHOTO]:  { target: 'viewingGallery',  action: () => history.back() },
            [NAV_EVENTS.POPSTATE]:     { target: 'viewingGallery',  action: actions.renderGallery },
            [NAV_EVENTS.OPEN_PHOTO]:   { target: 'viewingPhoto',    action: actions.replacePhotoState }
        }
    }
};

class NavigationFSM {
    constructor() {
        this.current = fsmDefinition.initial;
        this.listeners = [];
    }

    get state() { return this.current; }

    send(event, payload) {
        const transition = fsmDefinition.states[this.current]?.[event];
        if (!transition) {
            console.warn(`FSM: no transition from ${this.current} on ${event}`);
            return false;
        }
        const prev = this.current;
        this.current = transition.target;
        transition.action?.(payload);
        this.listeners.forEach(fn => fn({ prev, current: this.current, event, payload }));
        return true;
    }

    on(fn) {
        this.listeners.push(fn);
        return () => this.listeners = this.listeners.filter(f => f !== fn);
    }
}

export const navFSM = new NavigationFSM();