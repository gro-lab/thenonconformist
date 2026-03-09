// js/modules/gallery.js
// Gallery grid, masonry layout, lazy loading, cover images
// — thumbnails served via shared imageCache (image-cache.js singleton)
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom, clearDomCache } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';
import { createObserver } from '../lib/create-observer.js';
import { getDocIdFromUrl, TRANSITION_MS } from '../lib/utils.js';
import { imageCache } from '../lib/image-cache.js';

// Gallery configuration
const galleries = {
  low: {
    title: 'Language of Windows',
    dir: 'LoW',
    subtitle: 'Exploring the silent stories behind glass',
    color: '#FF6B35'
  },
  sol: {
    title: 'Snapshots of Life',
    dir: 'SoL',
    subtitle: 'Capturing the raw essence of everyday moments',
    color: '#9D4EDD'
  },
  r: {
    title: 'Reflections',
    dir: 'R',
    subtitle: 'Where reality meets its mirror image',
    color: '#06FFA5'
  },
  sa: {
    title: 'Street Art',
    dir: 'SA',
    subtitle: 'Urban expressions and vibrant creativity',
    color: '#FFD23F'
  }
};

let abortController = null;
let currentMasonryObserver = null;
const busUnsubs = [];

// Stable sort by likes
const stableSortByLikes = (items) => {
  return [...items].sort((a, b) => {
    if (b.likes !== a.likes) return b.likes - a.likes;
    return a.originalIndex - b.originalIndex;
  });
};

// Create image URLs
const createImageUrl = (dir, imageData) => {
  const owner = 'gro-lab';
  const repo = 'thenonconformist';
  const branch = 'main';
  const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}/${filename}`;
};

const createThumbnailUrl = (dir, imageData) => {
  const owner = 'gro-lab';
  const repo = 'thenonconformist';
  const branch = 'main';
  const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/thumbnails/${dir}/${filename}`;
};

// Load manifest
const loadManifest = withErrorHandling(async () => {
  const owner = 'gro-lab';
  const repo = 'thenonconformist';
  const branch = 'main';
  const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images.json`;

  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error('Manifest fetch failed');
  const manifest = await response.json();
  store.set('imageManifest', manifest);
  console.log('✅ Manifest loaded');
  return manifest;
}, { module: 'gallery' });

// Fallback manifest generator
const generateFallbackManifest = () => {
  const manifest = {};
  const defaultExtensions = { LoW: 'JPEG', SoL: 'JPEG', R: 'JPEG', SA: 'JPEG' };
  Object.keys(galleries).forEach(key => {
    const dir = galleries[key].dir;
    const ext = defaultExtensions[dir] || 'JPEG';
    manifest[dir] = [];
    for (let i = 1; i <= 50; i++) {
      manifest[dir].push({
        index: i,
        ext,
        originalName: `${dir}-${i}.${ext}`,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        orientation: 'horizontal',
        aspectDecimal: 16 / 9
      });
    }
  });
  store.set('imageManifest', manifest);
  return manifest;
};

// Load gallery data for a specific key — updates store.galleryImageData
const loadGalleryData = (galleryKey) => {
  const gallery = galleries[galleryKey];
  const dir = gallery.dir;
  const imageManifest = store.get('imageManifest') || {};
  const imageList = imageManifest[dir] || [];
  const likesCache = store.get('likesCache') || {};

  if (imageList.length === 0) return [];

  const images = imageList.map((imageData, originalIndex) => {
    const url = createImageUrl(dir, imageData);
    const docId = getDocIdFromUrl(url);
    const likes = likesCache[docId] !== undefined ? likesCache[docId] : 0;

    return {
      url,
      likes,
      originalIndex,
      gallery: galleryKey,
      title: gallery.title,
      alt: `${gallery.title} - Image ${imageData.index}`,
      aspectRatio: imageData.aspectDecimal || (imageData.width && imageData.height ?
        imageData.width / imageData.height :
        (imageData.orientation === 'vertical' ? 9 / 16 : 16 / 9)),
      imageData
    };
  });

  // Spread into new object so the Proxy detects the change
  const galleryImageData = store.get('galleryImageData') || {};
  store.set('galleryImageData', { ...galleryImageData, [galleryKey]: images });
  return images;
};

// Get most-liked image URL for a gallery (for cover display)
const getMostLikedImageUrl = (galleryKey) => {
  const galleryImageData = store.get('galleryImageData') || {};
  const images = galleryImageData[galleryKey];
  if (!images || images.length === 0) return null;
  const sorted = stableSortByLikes(images);
  return sorted[0]?.url || null;
};

// Refresh gallery counts on the selector cards
const refreshGalleryCounts = () => {
  const galleryImageData = store.get('galleryImageData') || {};
  Object.keys(galleries).forEach(key => {
    const countElement = document.getElementById(`${key}-count`);
    if (countElement && galleryImageData[key]) {
      countElement.textContent = `${galleryImageData[key].length} Works`;
    }
  });
};

// Refresh cover images on the selector cards
const refreshGalleryCovers = () => {
  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    const mostLikedUrl = getMostLikedImageUrl(key);
    if (cover && mostLikedUrl && imageCache.has(mostLikedUrl)) {
      cover.style.backgroundImage = `url(${imageCache.get(mostLikedUrl)})`;
      cover.classList.add('lazy-loaded');
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// SETUP GALLERY SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

const setupGallerySelector = async () => {
  await Promise.all(Object.keys(galleries).map(key => loadGalleryData(key)));

  // Setup cover images with lazy observer — uses imageCache.load() for both
  // fast synchronous hits and async fetches
  const coverObserver = createObserver({
    targets: '.gallery-cover[data-gallery]',
    rootMargin: '50px',
    once: true,
    onIntersect: (entry) => {
      const cover = entry.target;
      const bgUrl = cover.dataset.bg;
      if (!bgUrl) return;
      imageCache.load(bgUrl).then(resolvedUrl => {
        cover.style.backgroundImage = `url(${resolvedUrl})`;
        cover.classList.add('lazy-loaded');
        delete cover.dataset.bg;
      });
    }
  });

  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    const mostLikedUrl = getMostLikedImageUrl(key);
    if (cover && mostLikedUrl) {
      cover.dataset.bg = mostLikedUrl;
      coverObserver.observe(cover);
    }
  });

  refreshGalleryCounts();

  const { signal } = abortController;
  document.querySelectorAll('.gallery-cover').forEach(cover => {
    cover.addEventListener('click', function () {
      bus.emit('gallery:open', this.dataset.gallery);
    }, { signal });
  });

  console.log('✅ Gallery selector setup complete');
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD GALLERY CONTENT (masonry grid)
// ─────────────────────────────────────────────────────────────────────────────

const loadGalleryContent = (galleryId, options = {}) => {
  const { preserveScroll = false, showLoading = true } = options;
  const masonryGrid = dom.masonryGrid;
  const gallery = galleries[galleryId];
  const galleryImageData = store.get('galleryImageData') || {};
  const images = galleryImageData[galleryId];

  if (!images || images.length === 0) {
    console.error(`No images found for gallery: ${galleryId}`);
    return;
  }

  if (showLoading && dom.loadingIndicator) {
    dom.loadingIndicator.classList.add('active');
  }

  if (currentMasonryObserver) {
    currentMasonryObserver.disconnect();
    currentMasonryObserver = null;
  }

  masonryGrid.innerHTML = '';

  const sortedImages = stableSortByLikes(images);
  store.set('currentGalleryImages', sortedImages);

  // Masonry observer — uses imageCache.load() for async thumbnail fetch
  const masonryObserver = createObserver({
    rootMargin: '0px',
    once: true,
    onIntersect: (entry) => {
      const item = entry.target;
      const bgUrl = item.dataset.bg;
      if (!bgUrl) return;
      imageCache.load(bgUrl)
        .then(resolvedUrl => {
          item.style.backgroundImage = `url(${resolvedUrl})`;
          item.classList.add('lazy-loaded');
          delete item.dataset.bg;
        })
        .catch(() => {
          item.style.backgroundImage = `url(${bgUrl})`;
          item.classList.add('lazy-error');
          delete item.dataset.bg;
        });
    }
  });
  currentMasonryObserver = masonryObserver;

  sortedImages.forEach((image, index) => {
    const masonryItem = document.createElement('div');
    let orientation = 'square';
    if (image.aspectRatio > 1.2) orientation = 'horizontal';
    else if (image.aspectRatio < 0.8) orientation = 'vertical';

    masonryItem.className = `masonry-item ${orientation}`;
    masonryItem.style.animationDelay = `${index * 0.05}s`;

    const thumbUrl = createThumbnailUrl(gallery.dir, image.imageData);

    // Synchronous fast-path: already cached → apply immediately, skip observer
    if (imageCache.has(thumbUrl)) {
      masonryItem.style.backgroundImage = `url(${imageCache.get(thumbUrl)})`;
      masonryItem.classList.add('lazy-loaded');
    } else {
      masonryItem.dataset.bg = thumbUrl;
    }

    masonryItem.dataset.imageId = index;

    const overlay = document.createElement('div');
    overlay.className = 'item-overlay';
    overlay.style.opacity = '0';
    masonryItem.addEventListener('mouseenter', () => { overlay.style.opacity = '1'; });
    masonryItem.addEventListener('mouseleave', () => { overlay.style.opacity = '0'; });

    overlay.innerHTML = `
      <div class="item-category">${gallery.title}</div>
      <div class="item-title">Image ${image.imageData.index}</div>
      <div class="item-likes">♥ ${image.likes}</div>
    `;

    masonryItem.addEventListener('click', () => {
      bus.emit('photo:select', { url: image.url, galleryId, index });
    });

    masonryItem.appendChild(overlay);
    masonryGrid.appendChild(masonryItem);

    // Only observe items that still need loading
    if (masonryItem.dataset.bg) {
      masonryObserver.observe(masonryItem);
    }
  });

  if (dom.currentGalleryTitle) dom.currentGalleryTitle.textContent = gallery.title;
  if (dom.currentGallerySubtitle) dom.currentGallerySubtitle.textContent = gallery.subtitle;

  if (!preserveScroll) {
    store.set('scrollX', 0);
    store.set('scrollY', 0);
  }

  if (showLoading && dom.loadingIndicator) {
    setTimeout(() => { dom.loadingIndicator.classList.remove('active'); }, 100);
  }

  setTimeout(() => { bus.emit('gallery:contentLoaded', galleryId); }, 100);
};

// Public function to re-fetch gallery data and refresh UI
const updateGalleryData = (galleryId) => {
  loadGalleryData(galleryId);
  refreshGalleryCounts();
  refreshGalleryCovers();
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC INIT
// ─────────────────────────────────────────────────────────────────────────────

export const initGallery = async () => {
  console.log('🖼️ Initializing gallery module...');

  abortController = new AbortController();

  // Wire the shared cache singleton into the store so other modules can
  // access it without importing image-cache.js directly (avoids circular deps)
  store.set('galleryImageCache', imageCache);
  console.log('🗄️ [ImageCache] Initialized — unbounded, shared across gallery + modal');

  try {
    await loadManifest();
  } catch {
    generateFallbackManifest();
  }

  await setupGallerySelector();

  busUnsubs.push(
    bus.on('gallery:open', (galleryId) => {
      if (dom.loadingIndicator) dom.loadingIndicator.classList.add('active');
      if (dom.gallerySelector) dom.gallerySelector.classList.add('hidden');
      document.querySelector('.site-intro')?.classList.add('hidden');
      document.querySelector('.terms-footer')?.classList.add('hidden');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            loadGalleryContent(galleryId, { preserveScroll: false, showLoading: true });
            if (dom.loadingIndicator) dom.loadingIndicator.classList.remove('active');
            if (dom.galleryContent) dom.galleryContent.classList.add('active');
          }, TRANSITION_MS);
        });
      });
    })
  );

  busUnsubs.push(
    bus.on('consent:applied', () => {
      Object.keys(galleries).forEach(key => loadGalleryData(key));
      refreshGalleryCounts();
      refreshGalleryCovers();
      if (store.get('isGalleryOpen')) {
        loadGalleryContent(store.get('currentGallery'), { preserveScroll: true, showLoading: false });
      }
    })
  );

  // like:updated — invalidate BOTH the thumbnail and the full-size image for
  // the affected URL so neither half of the cache goes stale after a re-sort
  busUnsubs.push(
    bus.on('like:updated', ({ url, galleryId }) => {
      // Invalidate full-size image
      imageCache.invalidate(url);
      // Derive and invalidate thumbnail URL
      const thumbnailUrl = url.replace('/images/', '/images/thumbnails/');
      imageCache.invalidate(thumbnailUrl);
      console.debug(`♻️ [ImageCache] like:updated → invalidated full-size + thumbnail for ${url.split('/').pop()}`);

      updateGalleryData(galleryId);
      if (store.get('isGalleryOpen') && store.get('currentGallery') === galleryId) {
        loadGalleryContent(galleryId, { preserveScroll: true, showLoading: false });
      }
    })
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────────────────────

export const destroyGallery = () => {
  abortController?.abort();
  abortController = null;
  if (currentMasonryObserver) {
    currentMasonryObserver.disconnect();
    currentMasonryObserver = null;
  }
  busUnsubs.forEach(unsub => unsub());
  busUnsubs.length = 0;

  // Revoke all object URLs and clear the shared cache on teardown
  imageCache.clear();
  store.set('galleryImageCache', null);
};
