import { dom } from '../dom-elements.js';
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { createObserver } from '../lib/create-observer.js';
import { withErrorHandling } from '../lib/error-handler.js';
import { fetchAllLikes } from './firebase.js'; // only if consent

const galleries = {
  low: { title: 'Language of Windows', dir: 'LoW', subtitle: 'Exploring the silent stories behind glass', color: '#FF6B35' },
  sol: { title: 'Snapshots of Life', dir: 'SoL', subtitle: 'Capturing the raw essence of everyday moments', color: '#9D4EDD' },
  r:   { title: 'Reflections', dir: 'R',   subtitle: 'Where reality meets its mirror image', color: '#06FFA5' },
  sa:  { title: 'Street Art',   dir: 'SA', subtitle: 'Urban expressions and vibrant creativity', color: '#FFD23F' },
};

let coverObserver = null;
let masonryObserver = null;

export async function initGallery() {
  await loadManifest();
  if (store.get('functionalCookies')) await fetchAllLikes();
  await renderGallerySelector();
  attachCoverListeners();
  bus.on('consent:functional', async (enabled) => {
    if (enabled) await fetchAllLikes();
    refreshCountsAndCovers();
  });
  bus.on('likes:updated', refreshCountsAndCovers);
}

async function loadManifest() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/gro-lab/thenonconformist/main/images.json');
    if (!res.ok) throw new Error('Manifest fetch failed');
    store.set('imageManifest', await res.json());
  } catch {
    store.set('imageManifest', generateFallbackManifest());
  }
}

function generateFallbackManifest() { /* same as original */ }

export async function renderGallerySelector() {
  // load gallery data into store.galleryImageData
  for (const key of Object.keys(galleries)) {
    await loadGalleryData(key);
  }

  // lazy load cover images
  coverObserver?.disconnect();
  coverObserver = createObserver({
    targets: '.gallery-cover',
    rootMargin: '50px',
    once: true,
    onIntersect(entry) {
      const cover = entry.target;
      const bg = cover.dataset.bg;
      if (bg) {
        const img = new Image();
        img.onload = () => { cover.style.backgroundImage = `url(${bg})`; cover.classList.add('lazy-loaded'); };
        img.src = bg;
        delete cover.dataset.bg;
      }
    },
  });

  // update DOM
  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    const countEl = document.getElementById(`${key}-count`);
    const images = store.get('galleryImageData')[key] || [];
    if (cover && images.length) {
      const mostLiked = getMostLikedImageUrl(key);
      if (mostLiked) cover.dataset.bg = mostLiked;
    }
    if (countEl) {
      const totalLikes = images.reduce((s, img) => s + (img.likes || 0), 0);
      countEl.textContent = `${images.length} Works ${totalLikes} Likes`;
    }
  });
}

async function loadGalleryData(galleryKey) { /* same logic – uses store */ }
function getMostLikedImageUrl(galleryKey) { /* ... */ }

function attachCoverListeners() {
  dom.gallerySelector?.addEventListener('click', (e) => {
    const cover = e.target.closest('.gallery-cover');
    if (cover?.dataset.gallery) bus.emit('gallery:select', cover.dataset.gallery);
  });
}

export function openGallery(galleryId) {
  store.set('currentGallery', galleryId);
  store.set('isGalleryOpen', true);
  store.set('scrollPosition', { ...store.get('scrollPosition'), homepageY: window.scrollY });
  bus.emit('navigation:galleryOpened', galleryId);
}

export function loadGalleryContent(galleryId) {
  const images = store.get('galleryImageData')[galleryId];
  if (!images) return;
  const sorted = stableSortByLikes(images);
  store.set('currentGalleryImages', sorted);
  renderMasonry(galleryId, sorted);
  bus.emit('gallery:contentLoaded', galleryId);
}

function renderMasonry(galleryId, images) {
  const grid = dom.masonryGrid;
  if (!grid) return;
  grid.innerHTML = '';
  masonryObserver?.disconnect();

  masonryObserver = createObserver({
    targets: [],
    rootMargin: '0px',
    once: true,
    onIntersect(entry) {
      const item = entry.target;
      const bg = item.dataset.bg;
      if (bg) {
        const img = new Image();
        img.onload = () => { item.style.backgroundImage = `url(${bg})`; item.classList.add('lazy-loaded'); };
        img.src = bg;
        delete item.dataset.bg;
      }
    },
  });

  images.forEach((img, idx) => {
    const item = document.createElement('div');
    let orientation = 'square';
    if (img.aspectRatio > 1.2) orientation = 'horizontal';
    else if (img.aspectRatio < 0.8) orientation = 'vertical';
    item.className = `masonry-item ${orientation}`;
    item.dataset.bg = img.url;
    item.dataset.imageId = idx;  // for modal
    item.style.animationDelay = `${idx * 0.05}s`;

    const overlay = document.createElement('div');
    overlay.className = 'item-overlay';
    overlay.style.opacity = '0';
    overlay.innerHTML = `<div class="item-category">${galleries[galleryId].title}</div>
                         <div class="item-title">Image ${img.imageData?.index || idx}</div>
                         <div class="item-likes">♥ ${img.likes}</div>`;
    item.append(overlay);
    grid.append(item);
    masonryObserver.observe(item);
  });

  // click delegation handled by app.js or modal module
}

function stableSortByLikes(items) { /* ... */ }
function refreshCountsAndCovers() { /* ... */ }