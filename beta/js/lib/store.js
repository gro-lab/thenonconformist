// ============================================
// STORE — Centralized Proxy-based state
// Replaces all global variables with a reactive singleton
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
    this.state[key] = value; // triggers Proxy set trap
  }

  subscribe(key, callback) {
    return this.events.on(`state:${key}`, callback);
  }
}

// ── Application State Singleton ──────────────
export const store = new Store({
  // Firebase
  firebaseModules: null,
  firebaseApp: null,
  firebaseDb: null,
  functionalCookiesEnabled: false,

  // Image data
  imageManifest: {},
  likesCache: {},
  galleryImageData: {},

  // Gallery navigation
  currentGallery: 'low',
  currentGalleryImages: [],

  // Modal
  currentModalImageUrl: null,
  currentModalImageIndex: -1,
  isModalOpen: false,
  isProcessing: false,

  // Canvas drag
  isDragging: false,
  startX: 0,
  startY: 0,
  scrollX: 0,
  scrollY: 0,
  scrollLimits: { minX: 0, maxX: 0, minY: 0, maxY: 0 },

  // Scroll preservation
  homepageScrollY: 0,

  // History navigation
  isPopstateClosing: false,
});

// ── Static Configuration (never changes) ─────
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

// GitHub image hosting constants
export const GITHUB = {
  owner: 'gro-lab',
  repo: 'thenonconformist',
  branch: 'main',
  get baseUrl() {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}`;
  },
};
