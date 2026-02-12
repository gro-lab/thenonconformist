// ============================================
// GALLERY MODULE — Selector, masonry grid, canvas navigation
// Handles: manifest loading, cover images, grid rendering,
// drag/wheel/touch/keyboard canvas navigation, lazy loading.
// ============================================

import { store, GALLERIES, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { createObserver } from '../lib/create-observer.js';

let controller;
let lazyObserver = null;

// ── Utilities ────────────────────────────────

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// ── Image URL builders ───────────────────────

function createImageUrl(dir, imageData) {
  const filename = typeof imageData === 'string' ? imageData : imageData.filename;
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/images/${dir}/${filename}`;
}

function createThumbnailUrl(dir, imageData) {
  const filename = typeof imageData === 'string' ? imageData : imageData.filename;
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/images/thumbnails/${dir}/${filename}`;
}

// ── Manifest loading ─────────────────────────

export async function loadManifest() {
  try {
    const manifestUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/images.json`;
    console.log('📦 Loading manifest...');
    const response = await fetch(manifestUrl);

    if (!response.ok) throw new Error(`Manifest fetch failed: ${response.status}`);

    const manifest = await response.json();
    store.set('imageManifest', manifest);
    console.log('✅ Manifest loaded:', Object.keys(manifest));
    return manifest;
  } catch (error) {
    console.error('❌ Error loading manifest:', error);
    throw error;
  }
}

// ── Gallery covers: most-liked image as background ──

function getMostLikedImageUrl(galleryKey) {
  const gallery = GALLERIES[galleryKey];
  if (!gallery) return null;

  const manifest = store.get('imageManifest');
  const images = manifest[gallery.dir];
  if (!images || images.length === 0) return null;

  const likesCache = store.get('likesCache');

  // Sort by likes descending
  const sorted = images
    .map((img) => {
      const url = createImageUrl(gallery.dir, img);
      return { imageData: img, url, likes: likesCache[url] || 0 };
    })
    .sort((a, b) => b.likes - a.likes);

  // Use thumbnail for cover to keep load fast
  return createThumbnailUrl(gallery.dir, sorted[0].imageData);
}

export function setupGallerySelector() {
  const manifest = store.get('imageManifest');

  // Set cover images and counts
  const coverPromises = [];

  document.querySelectorAll('.gallery-cover').forEach((cover) => {
    const galleryId = cover.dataset.gallery;
    const gallery = GALLERIES[galleryId];
    if (!gallery) return;

    // Set image count
    const countEl = document.getElementById(`${galleryId}-count`);
    const images = manifest[gallery.dir];
    if (countEl && images) {
      countEl.textContent = `${images.length} photographs`;
    }

    // Set cover background from most liked image
    const coverUrl = getMostLikedImageUrl(galleryId);
    if (coverUrl) {
      const img = new Image();
      const promise = new Promise((resolve) => {
        img.onload = () => {
          cover.style.backgroundImage = `url('${coverUrl}')`;
          resolve();
        };
        img.onerror = () => resolve(); // Don't block on error
      });
      img.src = coverUrl;
      coverPromises.push(promise);
    }
  });

  return Promise.all(coverPromises);
}

export function refreshGalleryCovers() {
  document.querySelectorAll('.gallery-cover').forEach((cover) => {
    const galleryId = cover.dataset.gallery;
    const newUrl = getMostLikedImageUrl(galleryId);
    if (newUrl) {
      cover.style.backgroundImage = `url('${newUrl}')`;
    }
  });
}

// ── Open / Close gallery ─────────────────────

export function openGallery(galleryId) {
  const gallery = GALLERIES[galleryId];
  if (!gallery) return;

  store.set('savedScrollY', window.scrollY);
  store.set('currentGallery', galleryId);

  // Update header
  if (dom.galleryTitle) dom.galleryTitle.textContent = gallery.title;
  if (dom.gallerySubtitle) dom.gallerySubtitle.textContent = gallery.subtitle;

  // Render masonry grid
  renderMasonryGrid(galleryId);

  // Show gallery content, hide selector
  if (dom.galleryContent) dom.galleryContent.classList.add('active');
  if (dom.gallerySelector) dom.gallerySelector.classList.add('hidden');

  // Hide site intro and terms footer
  document.querySelector('.site-intro')?.classList.add('hidden');
  document.querySelector('.terms-footer')?.classList.add('hidden');

  // Push history state
  if (!store.get('isPopstateClosing')) {
    history.pushState({ type: 'gallery', id: galleryId }, '', `#${galleryId}`);
  }

  // Reset canvas position
  resetCanvasPosition();
}

export function closeGalleryDirect() {
  if (dom.galleryContent) dom.galleryContent.classList.remove('active');
  if (dom.gallerySelector) dom.gallerySelector.classList.remove('hidden');

  document.querySelector('.site-intro')?.classList.remove('hidden');
  document.querySelector('.terms-footer')?.classList.remove('hidden');

  // Disconnect lazy observer
  lazyObserver?.disconnect();

  // Restore scroll position
  const savedY = store.get('savedScrollY');
  requestAnimationFrame(() => {
    window.scrollTo(0, savedY);
  });

  store.set('currentGallery', null);
}

// ── Masonry grid rendering ───────────────────

function renderMasonryGrid(galleryId) {
  const gallery = GALLERIES[galleryId];
  if (!gallery || !dom.masonryGrid) return;

  const manifest = store.get('imageManifest');
  const images = manifest[gallery.dir];
  if (!images) return;

  const likesCache = store.get('likesCache');

  // Sort by likes
  const sortedImages = images
    .map((img) => {
      const url = createImageUrl(gallery.dir, img);
      return {
        imageData: img,
        url,
        thumbnailUrl: createThumbnailUrl(gallery.dir, img),
        likes: likesCache[url] || 0,
      };
    })
    .sort((a, b) => b.likes - a.likes);

  store.set('currentGalleryImages', sortedImages.map((s) => s.url));

  // Build HTML
  dom.masonryGrid.innerHTML = sortedImages
    .map((item, index) => {
      const orientation = getOrientation(item.imageData);
      const aspectStyle = getAspectStyle(item.imageData);
      return `
        <div class="masonry-item ${orientation}" 
             data-index="${index}" 
             data-url="${item.url}"
             style="animation-delay: ${index * 0.05}s; ${aspectStyle}">
          <img data-src="${item.thumbnailUrl}" 
               alt="${gallery.title} photograph ${index + 1}"
               loading="lazy"
               style="width: 100%; height: 100%; object-fit: cover;">
          <div class="item-overlay">
            <span class="item-likes">${item.likes > 0 ? '♥ ' + item.likes : ''}</span>
          </div>
        </div>`;
    })
    .join('');

  // Setup lazy loading
  setupLazyLoading();
}

function getOrientation(imageData) {
  if (typeof imageData === 'object' && imageData.width && imageData.height) {
    const ratio = imageData.width / imageData.height;
    if (ratio > 1.2) return 'horizontal';
    if (ratio < 0.8) return 'vertical';
    return 'square';
  }
  return 'vertical'; // default
}

function getAspectStyle(imageData) {
  if (typeof imageData === 'object' && imageData.width && imageData.height) {
    return `aspect-ratio: ${imageData.width}/${imageData.height};`;
  }
  return '';
}

export function reloadCurrentGallery() {
  const currentGallery = store.get('currentGallery');
  if (currentGallery) {
    renderMasonryGrid(currentGallery);
  }
}

// ── Lazy loading ─────────────────────────────

function setupLazyLoading() {
  lazyObserver?.disconnect();

  lazyObserver = createObserver({
    targets: '#masonry-grid img[data-src]',
    rootMargin: '200px 0px',
    once: true,
    onIntersect(entry) {
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.addEventListener('load', () => {
          img.closest('.masonry-item')?.classList.add('is-visible');
        }, { once: true });
      }
    },
  });
}

// ── Canvas navigation (drag, wheel, touch, keyboard) ──

let touchStartX = 0;
let touchStartY = 0;
let isTouchDragging = false;

function resetCanvasPosition() {
  store.set('scrollX', 0);
  store.set('scrollY', 0);
  store.set('currentX', 0);
  store.set('currentY', 0);
  if (dom.canvasContainer) {
    dom.canvasContainer.style.transform = 'translate(0px, 0px)';
  }
}

function updateCanvasPosition() {
  const x = store.get('currentX');
  const y = store.get('currentY');
  if (dom.canvasContainer) {
    dom.canvasContainer.style.transform = `translate(${x}px, ${y}px)`;
  }
}

function clampPosition(x, y) {
  const container = dom.canvasContainer;
  const canvas = dom.infiniteCanvas;
  if (!container || !canvas) return { x, y };

  const containerRect = container.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const maxScrollX = Math.max(0, containerRect.width - canvasRect.width + 100);
  const maxScrollY = Math.max(0, containerRect.height - canvasRect.height + 100);

  return {
    x: Math.max(-maxScrollX, Math.min(100, x)),
    y: Math.max(-maxScrollY, Math.min(100, y)),
  };
}

// Mouse drag
function onMouseDown(e) {
  if (e.target.closest('.masonry-item') || e.target.closest('.back-button')) return;
  store.set('isDragging', true);
  store.set('startX', e.clientX - store.get('currentX'));
  store.set('startY', e.clientY - store.get('currentY'));
  if (dom.infiniteCanvas) dom.infiniteCanvas.style.cursor = 'grabbing';
}

function onMouseMove(e) {
  if (!store.get('isDragging')) return;
  e.preventDefault();
  const rawX = e.clientX - store.get('startX');
  const rawY = e.clientY - store.get('startY');
  const clamped = clampPosition(rawX, rawY);
  store.set('currentX', clamped.x);
  store.set('currentY', clamped.y);
  updateCanvasPosition();
}

function onMouseUp() {
  store.set('isDragging', false);
  if (dom.infiniteCanvas) dom.infiniteCanvas.style.cursor = 'grab';
}

// Wheel scroll
function onWheel(e) {
  if (!dom.galleryContent?.classList.contains('active')) return;
  e.preventDefault();
  const rawX = store.get('currentX') - e.deltaX;
  const rawY = store.get('currentY') - e.deltaY;
  const clamped = clampPosition(rawX, rawY);
  store.set('currentX', clamped.x);
  store.set('currentY', clamped.y);
  updateCanvasPosition();
}

// Touch
function onTouchStart(e) {
  if (e.target.closest('.masonry-item')) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  isTouchDragging = false;
  store.set('startX', touch.clientX - store.get('currentX'));
  store.set('startY', touch.clientY - store.get('currentY'));
}

function onTouchMove(e) {
  if (e.target.closest('.masonry-item')) return;
  const touch = e.touches[0];
  const dx = Math.abs(touch.clientX - touchStartX);
  const dy = Math.abs(touch.clientY - touchStartY);

  if (dx > 5 || dy > 5) {
    isTouchDragging = true;
    // Prevent default only for canvas dragging, not for item clicks
    e.preventDefault();
  }

  if (!isTouchDragging) return;

  const rawX = touch.clientX - store.get('startX');
  const rawY = touch.clientY - store.get('startY');
  const clamped = clampPosition(rawX, rawY);
  store.set('currentX', clamped.x);
  store.set('currentY', clamped.y);
  updateCanvasPosition();
}

function onTouchEnd() {
  isTouchDragging = false;
}

// Keyboard
function onKeydown(e) {
  if (!dom.galleryContent?.classList.contains('active')) return;
  // Don't close gallery if modal is open
  if (store.get('isModalOpen')) return;

  const step = 100;
  let x = store.get('currentX');
  let y = store.get('currentY');

  switch (e.key) {
    case 'ArrowUp':
      y += step;
      break;
    case 'ArrowDown':
      y -= step;
      break;
    case 'ArrowLeft':
      x += step;
      break;
    case 'ArrowRight':
      x -= step;
      break;
    case 'Escape':
      closeGalleryDirect();
      if (!store.get('isPopstateClosing')) {
        history.pushState({ type: 'home' }, '', window.location.pathname);
      }
      return;
    default:
      return;
  }

  e.preventDefault();
  const clamped = clampPosition(x, y);
  store.set('currentX', clamped.x);
  store.set('currentY', clamped.y);
  updateCanvasPosition();
}

// ── Grid item clicks → open modal ────────────

function onGridClick(e) {
  // Ignore if dragging
  if (store.get('isDragging') || isTouchDragging) return;

  const item = e.target.closest('.masonry-item');
  if (!item) return;

  e.stopPropagation();

  const url = item.dataset.url;
  const index = parseInt(item.dataset.index, 10);

  bus.emit('photo:selected', { url, index });
}

// ── Back button ──────────────────────────────

export function setupBackButton() {
  // Handled through event delegation in initGallery
}

function onBackClick() {
  closeGalleryDirect();
  if (!store.get('isPopstateClosing')) {
    history.pushState({ type: 'home' }, '', window.location.pathname);
  }
}

// ── Setup gallery selector click delegation ──

function onSelectorClick(e) {
  const cover = e.target.closest('.gallery-cover');
  if (!cover) return;

  const galleryId = cover.dataset.gallery;
  if (galleryId) {
    bus.emit('gallery:open', { galleryId });
  }
}

// ── Init / Destroy ───────────────────────────

export function initGallery() {
  controller = new AbortController();
  const { signal } = controller;

  // Gallery selector delegation
  dom.gallerySelector?.addEventListener('click', onSelectorClick, { signal });

  // Canvas navigation — mouse
  dom.infiniteCanvas?.addEventListener('mousedown', onMouseDown, { signal });
  document.addEventListener('mousemove', onMouseMove, { signal });
  document.addEventListener('mouseup', onMouseUp, { signal });

  // Canvas navigation — wheel
  dom.infiniteCanvas?.addEventListener('wheel', onWheel, { passive: false, signal });

  // Canvas navigation — touch (iOS safe: passive false for touchmove only)
  dom.infiniteCanvas?.addEventListener('touchstart', onTouchStart, { passive: true, signal });
  dom.infiniteCanvas?.addEventListener('touchmove', onTouchMove, { passive: false, signal });
  dom.infiniteCanvas?.addEventListener('touchend', onTouchEnd, { passive: true, signal });

  // Canvas navigation — keyboard
  document.addEventListener('keydown', onKeydown, { signal });

  // Grid item clicks
  dom.masonryGrid?.addEventListener('click', onGridClick, { signal });

  // Back button
  dom.backButton?.addEventListener('click', onBackClick, { signal });

  // Debounced resize
  window.addEventListener('resize', debounce(() => {
    if (store.get('currentGallery')) {
      resetCanvasPosition();
    }
  }, 150), { signal });

  // Listen for cover refresh events
  bus.on('gallery:covers:refresh', refreshGalleryCovers);
}

export function destroyGallery() {
  controller?.abort();
  lazyObserver?.disconnect();
}

// ── Setup canvas navigation (called from app.js) ──

export function setupCanvasNavigation() {
  // Canvas navigation is set up in initGallery() via event listeners.
  // This export exists for API compatibility.
}
