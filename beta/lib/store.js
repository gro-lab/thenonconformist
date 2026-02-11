import { bus } from './event-bus.js';

class Store {
  constructor(initial) {
    this.state = new Proxy(initial, {
      set: (target, prop, value) => {
        const old = target[prop];
        target[prop] = value;
        if (old !== value) {
          bus.emit(`state:${prop}`, { prop, value, old });
          bus.emit('state:changed', { prop, value, old });
        }
        return true;
      }
    });
  }
  get(prop) { return this.state[prop]; }
  set(prop, val) { this.state[prop] = val; }
}
export const store = new Store({
  // 🧬 replaces ~20 globals
  currentGallery: null,
  currentPhoto: null,
  isModalOpen: false,
  isGalleryOpen: false,
  galleryImageData: {},      // { low: [], sol: [], r: [], sa: [] }
  likesCache: {},
  functionalCookies: false,
  scrollPosition: { x: 0, y: 0, homepageY: 0 },
  imageManifest: {},
  firebaseReady: false,
  firebaseModules: null,
  db: null,
});