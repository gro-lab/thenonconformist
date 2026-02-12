// ============================================
// GALLERY MODULE â€” Selector, masonry grid, canvas navigation
// ============================================

import { store, GALLERIES, GITHUB } from './store.js';
import { bus } from './event-bus.js';
import { createObserver } from './create-observer.js';
import { dom } from './dom-elements.js';
import { getDocIdFromUrl } from './firebase.js';

let controller;        // AbortController for lifecycle cleanup
let masonryObs = null; // current masonry IntersectionObserver handle
let coverObs   = null; // current cover IntersectionObserver handle

// â”€â”€ Image URL helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createImageUrl(dir, imageData) {
  const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
  return `${GITHUB.baseUrl}/images/${dir}/${filename}`;
}

function createThumbnailUrl(dir, imageData) {
  const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
  return `${GITHUB.baseUrl}/images/thumbnails/${dir}/${filename}`;
}

// â”€â”€ Sorting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stableSortByLikes(items) {
  return [...items].sort((a, b) => {
    if (b.likes !== a.likes) return b.likes - a.likes;
    return a.originalIndex - b.originalIndex;
  });
}

// â”€â”€ Manifest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function loadManifest() {
  try {
    const url = `${GITHUB.baseUrl}/images.json`;
    const response = await fetch(url);

    if (!response.ok) return generateFallbackManifest();

    const manifest = await response.json();
    store.set('imageManifest', manifest);
    console.log('âœ… Manifest loaded');
    return manifest;
  } catch (error) {
    console.warn('âš ï¸ Manifest load error:', error);
    return generateFallbackManifest();
  }
}

function generateFallbackManifest() {
  const manifest = {};
  Object.keys(GALLERIES).forEach((key) => {
    const dir = GALLERIES[key].dir;
    manifest[dir] = [];
    for (let i = 1; i <= 50; i++) {
      manifest[dir].push({
        index: i,
        ext: 'JPEG',
        originalName: `${dir}-${i}.JPEG`,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        orientation: 'horizontal',
        aspectDecimal: 16 / 9,
      });
    }
  });
  store.set('imageManifest', manifest);
  return manifest;
}

// â”€â”€ Gallery Data Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function loadGalleryData(galleryKey) {
  const gallery   = GALLERIES[galleryKey];
  const manifest  = store.get('imageManifest');
  const imageList = manifest[gallery.dir] || [];

  if (imageList.length === 0) return [];

  const likesCache = store.get('likesCache');

  const images = imageList.map((imageData, originalIndex) => {
    const url   = createImageUrl(gallery.dir, imageData);
    const docId = getDocIdFromUrl(url);
    const likes = likesCache[docId] ?? 0;

    return {
      url,
      likes,
      originalIndex,
      gallery: galleryKey,
      title: gallery.title,
      alt: `${gallery.title} - Image ${imageData.index}`,
      aspectRatio:
        imageData.aspectDecimal ||
        (imageData.width && imageData.height
          ? imageData.width / imageData.height
          : imageData.orientation === 'vertical' ? 9 / 16 : 16 / 9),
      imageData,
    };
  });

  const data = { ...store.get('galleryImageData'), [galleryKey]: images };
  store.set('galleryImageData', data);
  return images;
}

function getMostLikedImageUrl(galleryKey) {
  const allData = store.get('galleryImageData');
  const images  = allData[galleryKey];
  if (!images?.length) return '';

  const sorted = stableSortByLikes(images);
  return createThumbnailUrl(GALLERIES[galleryKey].dir, sorted[0].imageData);
}

// â”€â”€ Lazy-loading image helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function lazyLoadBg(item) {
  const bgUrl = item.dataset.bg;
  if (!bgUrl) return;

  const img = new Image();
  img.onload = () => {
    item.style.backgroundImage = `url(${bgUrl})`;
    item.classList.add('lazy-loaded');
    delete item.dataset.bg;
  };
  img.onerror = () => {
    item.classList.add('lazy-error');
    delete item.dataset.bg;
  };
  img.src = bgUrl;
}

// â”€â”€ Gallery Selector Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function setupGallerySelector() {
  console.log('ðŸ”„ Setting up gallery selectorâ€¦');

  await Promise.all(Object.keys(GALLERIES).map(loadGalleryData));

  // Cover observer for lazy-loading gallery cover images
  coverObs?.disconnect();
  coverObs = createObserver({
    rootMargin: '50px',
    once: true,
    onIntersect(entry) {
      lazyLoadBg(entry.target);
    },
  });

  const allData = store.get('galleryImageData');

  Object.keys(GALLERIES).forEach((key) => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    const countEl = document.getElementById(`${key}-count`);

    if (cover && allData[key]) {
      const url = getMostLikedImageUrl(key);
      if (url) {
        cover.dataset.bg = url;
        coverObs.observe(cover);
      }
    }

    if (countEl && allData[key]) {
      const count = allData[key].length;
      const totalLikes = allData[key].reduce((sum, img) => sum + (img.likes || 0), 0);
      countEl.textContent = `${count} Works ${totalLikes} Likes`;
    }
  });

  // Event delegation for gallery cover clicks
  dom.gallerySelector?.addEventListener(
    'click',
    (e) => {
      const cover = e.target.closest('.gallery-cover[data-gallery]');
      if (cover) bus.emit('gallery:open', { galleryId: cover.dataset.gallery });
    },
    { signal: controller?.signal }
  );

  console.log('âœ… Gallery selector ready');
}

// â”€â”€ Open / Close Gallery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function openGallery(galleryId) {
  store.set('currentGallery', galleryId);
  store.set('homepageScrollY', window.scrollY || document.documentElement.scrollTop);

  history.pushState({ page: 'gallery', gallery: galleryId }, '', window.location.href);

  const siteIntro   = document.querySelector('.site-intro');
  const termsFooter = document.querySelector('.terms-footer');

  dom.loadingIndicator?.classList.add('active');
  dom.galleryTitle.textContent    = GALLERIES[galleryId].title;
  dom.gallerySubtitle.textContent = GALLERIES[galleryId].subtitle;

  // Double rAF ensures spinner is painted before DOM swap
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dom.gallerySelector?.classList.add('hidden');
      siteIntro?.classList.add('hidden');
      termsFooter?.classList.add('hidden');

      setTimeout(() => {
        loadGalleryContent(galleryId);
        dom.loadingIndicator?.classList.remove('active');
        dom.galleryContent?.classList.add('active');
      }, 800);
    });
  });
}

export function closeGalleryDirect() {
  const siteIntro   = document.querySelector('.site-intro');
  const termsFooter = document.querySelector('.terms-footer');

  dom.loadingIndicator?.classList.add('active');
  masonryObs?.disconnect();
  masonryObs = null;

  refreshGalleryCounts();
  refreshGalleryCovers();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dom.galleryContent?.classList.remove('active');

      setTimeout(() => {
        dom.gallerySelector?.classList.remove('hidden');
        siteIntro?.classList.remove('hidden');
        termsFooter?.classList.remove('hidden');
        store.set('currentGallery', null);

        requestAnimationFrame(() => {
          window.scrollTo({ top: store.get('homepageScrollY'), behavior: 'instant' });
          requestAnimationFrame(() => {
            dom.loadingIndicator?.classList.remove('active');
          });
        });
      }, 800);
    });
  });
}

export function closeGallery() {
  if (store.get('isPopstateClosing')) {
    closeGalleryDirect();
    return;
  }
  history.back();
}

// â”€â”€ Masonry Grid Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function loadGalleryContent(galleryId) {
  const gallery = GALLERIES[galleryId];
  const allData = store.get('galleryImageData');
  const images  = allData[galleryId];

  if (!images?.length) {
    console.error(`No images found for gallery: ${galleryId}`);
    return;
  }

  masonryObs?.disconnect();
  dom.masonryGrid.innerHTML = '';

  const sorted = stableSortByLikes(images);
  store.set('currentGalleryImages', sorted);

  console.log(`ðŸŽ¨ Rendering ${sorted.length} images for ${galleryId}`);

  masonryObs = createObserver({
    rootMargin: '0px',
    once: true,
    onIntersect(entry) {
      lazyLoadBg(entry.target);
    },
  });

  sorted.forEach((image, index) => {
    const item = document.createElement('div');

    let orientation = 'square';
    if (image.aspectRatio > 1.2) orientation = 'horizontal';
    else if (image.aspectRatio < 0.8) orientation = 'vertical';

    item.className = `masonry-item ${orientation}`;
    item.style.animationDelay = `${index * 0.05}s`;
    item.dataset.bg = image.url;
    item.dataset.imageIndex = index;

    const overlay = document.createElement('div');
    overlay.className = 'item-overlay';
    overlay.style.opacity = '0';
    overlay.innerHTML = `
      <div class="item-category">${gallery.title}</div>
      <div class="item-title">Image ${image.imageData.index}</div>
      <div class="item-likes">â™¥ ${image.likes}</div>
    `;

    item.addEventListener('mouseenter', () => { overlay.style.opacity = '1'; });
    item.addEventListener('mouseleave', () => { overlay.style.opacity = '0'; });

    item.addEventListener('click', () => {
      bus.emit('modal:open', {
        imageUrl: image.url,
        category: gallery.title,
        galleryKey: galleryId,
        imageIndex: index,
      });
    });

    item.appendChild(overlay);
    dom.masonryGrid.appendChild(item);
    masonryObs.observe(item);
  });

  store.set('scrollX', 0);
  store.set('scrollY', 0);

  setTimeout(() => {
    calculateScrollLimits();
    updateCanvasTransform();
  }, 100);
  setTimeout(calculateScrollLimits, 500);
}

// Publicly re-render current gallery (called after like updates)
export function reloadCurrentGallery() {
  const current = store.get('currentGallery');
  if (current) loadGalleryContent(current);
}

// â”€â”€ Refresh Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function refreshGalleryCounts() {
  const allData = store.get('galleryImageData');
  Object.keys(GALLERIES).forEach((key) => {
    const countEl = document.getElementById(`${key}-count`);
    if (countEl && allData[key]) {
      const count      = allData[key].length;
      const totalLikes = allData[key].reduce((sum, img) => sum + (img.likes || 0), 0);
      countEl.textContent = `${count} Works ${totalLikes} Likes`;
    }
  });
}

function refreshGalleryCovers() {
  const allData = store.get('galleryImageData');
  Object.keys(GALLERIES).forEach((key) => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    if (cover && allData[key]) {
      const url = getMostLikedImageUrl(key);
      if (url) {
        cover.style.backgroundImage = `url(${url})`;
        cover.classList.add('lazy-loaded');
        delete cover.dataset.bg;
      }
    }
  });
}

// â”€â”€ Canvas Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function updateCanvasTransform() {
  const container = dom.canvasContainer;
  if (container) {
    container.style.transform = `translate(${store.get('scrollX')}px, ${store.get('scrollY')}px)`;
  }
}

function clampScroll() {
  const limits = store.get('scrollLimits');
  store.set('scrollX', Math.max(limits.minX, Math.min(limits.maxX, store.get('scrollX'))));
  store.set('scrollY', Math.max(limits.minY, Math.min(limits.maxY, store.get('scrollY'))));
}

function calculateScrollLimits() {
  const grid     = dom.masonryGrid;
  const canvas   = dom.infiniteCanvas;
  const viewport = dom.galleryContent;
  if (!grid || !canvas || !viewport) return;

  const gridRect     = grid.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();

  const style         = getComputedStyle(canvas);
  const paddingLeft   = parseInt(style.paddingLeft) || 20;
  const paddingRight  = parseInt(style.paddingRight) || 20;
  const paddingTop    = parseInt(style.paddingTop) || 120;
  const paddingBottom = parseInt(style.paddingBottom) || 80;

  const scrollableW = Math.max(0, gridRect.width  - viewportRect.width  + paddingLeft + paddingRight);
  const scrollableH = Math.max(0, gridRect.height - viewportRect.height + paddingTop  + paddingBottom);

  store.set('scrollLimits', {
    minX: -scrollableW, maxX: scrollableW,
    minY: -scrollableH, maxY: scrollableH,
  });
}

export function setupCanvasNavigation() {
  const canvas         = dom.infiniteCanvas;
  const galleryContent = dom.galleryContent;
  if (!canvas) return;

  const { signal } = controller;

  function isGalleryActive() {
    return galleryContent?.classList.contains('active');
  }

  // â”€â”€ Mouse drag â”€â”€
  canvas.addEventListener('mousedown', (e) => {
    if (!isGalleryActive()) return;
    store.set('isDragging', true);
    store.set('startX', e.clientX - store.get('scrollX'));
    store.set('startY', e.clientY - store.get('scrollY'));
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }, { signal });

  document.addEventListener('mousemove', (e) => {
    if (!store.get('isDragging') || !isGalleryActive()) return;
    store.set('scrollX', e.clientX - store.get('startX'));
    store.set('scrollY', e.clientY - store.get('startY'));
    clampScroll();
    updateCanvasTransform();
  }, { signal });

  document.addEventListener('mouseup', () => {
    store.set('isDragging', false);
    canvas.style.cursor = '';
  }, { signal });

  // â”€â”€ Touch drag â”€â”€
  canvas.addEventListener('touchstart', (e) => {
    if (!isGalleryActive() || e.touches.length !== 1) return;
    store.set('isDragging', true);
    store.set('startX', e.touches[0].clientX - store.get('scrollX'));
    store.set('startY', e.touches[0].clientY - store.get('scrollY'));
  }, { passive: false, signal });

  document.addEventListener('touchmove', (e) => {
    if (!store.get('isDragging') || !isGalleryActive() || e.touches.length !== 1) return;
    store.set('scrollX', e.touches[0].clientX - store.get('startX'));
    store.set('scrollY', e.touches[0].clientY - store.get('startY'));
    clampScroll();
    updateCanvasTransform();
  }, { passive: false, signal });

  document.addEventListener('touchend', () => {
    store.set('isDragging', false);
  }, { signal });

  // â”€â”€ Keyboard navigation â”€â”€
  document.addEventListener('keydown', (e) => {
    if (!isGalleryActive()) return;
    // Let modal handle its own keys
    if (!dom.modal?.hasAttribute('hidden')) return;

    const speed = 30;
    switch (e.key) {
      case 'ArrowLeft':  store.set('scrollX', store.get('scrollX') + speed); break;
      case 'ArrowRight': store.set('scrollX', store.get('scrollX') - speed); break;
      case 'ArrowUp':    store.set('scrollY', store.get('scrollY') + speed); break;
      case 'ArrowDown':  store.set('scrollY', store.get('scrollY') - speed); break;
      case 'Escape':     closeGallery(); return;
      default: return;
    }
    clampScroll();
    updateCanvasTransform();
  }, { signal });

  // â”€â”€ Wheel â”€â”€
  canvas.addEventListener('wheel', (e) => {
    if (!isGalleryActive()) return;
    e.preventDefault();
    store.set('scrollX', store.get('scrollX') - e.deltaX * 0.5);
    store.set('scrollY', store.get('scrollY') - e.deltaY * 0.5);
    clampScroll();
    updateCanvasTransform();
  }, { passive: false, signal });

  // â”€â”€ Resize â”€â”€
  window.addEventListener('resize', () => {
    if (isGalleryActive()) setTimeout(calculateScrollLimits, 100);
  }, { signal });
}

// â”€â”€ Back Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function setupBackButton() {
  dom.backButton?.addEventListener('click', closeGallery, { signal: controller?.signal });
}

// â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function initGallery() {
  controller = new AbortController();
}

export function destroyGallery() {
  controller?.abort();
  masonryObs?.disconnect();
  coverObs?.disconnect();
  masonryObs = null;
  coverObs   = null;
}
