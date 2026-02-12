// ============================================
// STORE — Centralized Proxy-based reactive state
// Replaces ~20 global variables with a single
// reactive, subscribable singleton.
// ============================================

import { EventBus } from './event-bus.js';

class Store {
  constructor(initialState) {
    this.events = new EventBus();
    this.state = new Proxy(initialState, {
      set: (target, key, value) => {
        const oldValue = target[key];
        target[key] = value;
        if (oldValue !== value) {
          this.events.emit(`state:${key}`, { key, value, oldValue });
          this.events.emit('state:changed', { key, value, oldValue });
        }
        return true;
      },
    });
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value; // triggers Proxy
  }

  subscribe(key, callback) {
    return this.events.on(`state:${key}`, callback);
  }
}

// ── Gallery configuration ────────────────────

export const GALLERIES = {
  low: {
    title: 'Language of Windows',
    dir: 'LoW',
    subtitle: 'Exploring the silent stories behind glass',
    color: '#FF6B35',
  },
  sol: {
    title: 'Snapshots of Life',
    dir: 'SoL',
    subtitle: 'Capturing the raw essence of everyday moments',
    color: '#9D4EDD',
  },
  r: {
    title: 'Reflections',
    dir: 'R',
    subtitle: 'Where reality meets its mirror image',
    color: '#06FFA5',
  },
  sa: {
    title: 'Street Art',
    dir: 'SA',
    subtitle: 'Urban expressions and vibrant creativity',
    color: '#FFD23F',
  },
};

// ── GitHub repository config ─────────────────

export const GITHUB_OWNER = 'gro-lab';
export const GITHUB_REPO = 'thenonconformist';
export const GITHUB_BRANCH = 'main';

// ── Singleton store instance ─────────────────

export const store = new Store({
  // Image data
  imageManifest: {},
  likesCache: {},
  galleryImageData: {},

  // Current gallery state
  currentGallery: null,
  currentGalleryImages: [],

  // Modal state
  currentModalImageUrl: null,
  currentModalImageIndex: -1,
  isModalOpen: false,

  // Processing flag
  isProcessing: false,

  // Navigation
  isPopstateClosing: false,
  savedScrollY: 0,

  // Canvas drag state
  isDragging: false,
  startX: 0,
  startY: 0,
  scrollX: 0,
  scrollY: 0,
  currentX: 0,
  currentY: 0,

  // GDPR / Cookies
  functionalCookiesEnabled: false,
});
