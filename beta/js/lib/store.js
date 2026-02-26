// js/lib/store.js (updated with isCookieModalOpen)
// Proxy-based reactive state store with event bus integration
import { bus } from './event-bus.js';

class Store {
  constructor(initialState = {}) {
    this.bus = bus; // Use shared event bus
    this.state = new Proxy(initialState, {
      set: (target, key, value) => {
        const oldValue = target[key];
        if (oldValue === value) return true; // no change
        
        target[key] = value;
        
        // Emit specific event for this key
        this.bus.emit(`state:${String(key)}`, { key, value, oldValue });
        // Emit generic state changed event
        this.bus.emit('state:changed', { key, value, oldValue });
        
        return true;
      }
    });
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value; // triggers Proxy
  }

  // Bulk update
  patch(obj) {
    Object.entries(obj).forEach(([key, value]) => {
      this.state[key] = value;
    });
  }

  // Subscribe to changes for a specific key
  subscribe(key, callback) {
    return this.bus.on(`state:${String(key)}`, callback);
  }

  // Subscribe to any state change
  subscribeAll(callback) {
    return this.bus.on('state:changed', callback);
  }

  // Get entire state snapshot (for debugging)
  snapshot() {
    return { ...this.state };
  }
}

// Initial state based on original globals
const initialState = {
  // Gallery state
  currentGallery: 'low',
  currentPhoto: null,
  currentPhotoIndex: -1,
  currentGalleryImages: [],
  isModalOpen: false,
  isGalleryOpen: false,
  isTermsModalOpen: false,
  isCookieModalOpen: false, // added for cookie settings modal
  
  // Like/counts
  likesCache: {},
  
  // Cookie consent
  functionalCookiesEnabled: false,
  cookiePreferences: null,
  consentExpired: false, // tracks whether consent needs renewal
  
  // Navigation
  homepageScrollY: 0,
  isDragging: false,
  scrollX: 0,
  scrollY: 0,
  scrollLimits: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  
  // Firebase (lazy)
  firebaseApp: null,
  firebaseDb: null,
  firebaseModules: null,
  
  // Image manifest
  imageManifest: {},
  galleryImageData: {
    low: [],
    sol: [],
    r: [],
    sa: []
  }
};

export const store = new Store(initialState);
