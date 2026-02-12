// js/lib/store.js
import { bus } from './event-bus.js';

class Store {
    constructor(initialState) {
        this.state = new Proxy(initialState, {
            set: (target, key, value) => {
                const oldValue = target[key];
                if (oldValue === value) return true;
                target[key] = value;
                bus.emit(`state:${key}`, { key, value, oldValue });
                bus.emit('state:changed', { key, value, oldValue });
                return true;
            }
        });
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        this.state[key] = value;
    }

    // Convenience: update an object property deeply (simple merge)
    patch(key, updates) {
        const current = this.get(key);
        if (current && typeof current === 'object') {
            this.set(key, { ...current, ...updates });
        }
    }

    subscribe(key, callback) {
        return bus.on(`state:${key}`, callback);
    }
}

export const store = new Store({
    // ----- Gallery state -----
    currentGallery: null,          // 'low', 'sol', 'r', 'sa'
    galleryImageData: {},         // { low: [...], sol: [...], ... }
    imageManifest: {},           // raw manifest from images.json
    likesCache: {},             // docId -> like count
    currentGalleryImages: [],   // sorted images for open gallery
    currentModalImageUrl: null,
    currentModalImageIndex: -1,

    // ----- UI state -----
    isModalOpen: false,
    isGalleryOpen: false,
    isTermsModalOpen: false,
    isCookieModalOpen: false,

    // ----- Canvas navigation -----
    scrollX: 0,
    scrollY: 0,
    scrollLimits: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },

    // ----- Scroll memory -----
    homepageScrollY: 0,

    // ----- Consent -----
    functionalCookiesEnabled: false,
    cookiePreferences: null,

    // ----- Navigation FSM -----
    navState: 'browsing',        // browsing, viewingGallery, viewingPhoto

    // ----- Misc -----
    isProcessing: false,        // for like button debounce
});