// js/modules/gallery.js
// Gallery grid, masonry layout, lazy loading, cover images
// + DOM preservation cache, thumbnail prefetching
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom, clearDomCache } from '../dom-elements.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';
import { createObserver } from '../lib/create-observer.js';
import { getDocIdFromUrl, TRANSITION_MS } from '../lib/utils.js';

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

// ==================== DOM Preservation Cache ====================
// Holds detached DOM fragments per gallery so re-opening skips rebuild + re-lazy-load
const galleryDomCache = new Map();

/**
 * Save the current masonry grid children into a DocumentFragment keyed by galleryId.
 * Nodes are *moved* (not cloned) so the grid is emptied as a side-effect.
 */
const cacheGalleryDom = (galleryId) => {
  const masonryGrid = dom.masonryGrid;
  if (!masonryGrid || masonryGrid.children.length === 0) return;

  const count = masonryGrid.children.length;
  const fragment = document.createDocumentFragment();
  while (masonryGrid.firstChild) {
    fragment.appendChild(masonryGrid.firstChild);
  }
  galleryDomCache.set(galleryId, fragment);
  console.log(`💾 Cached gallery DOM: ${galleryId} (${count} items)`);
};

// ==================== Image Prefetching ====================
// After a gallery finishes loading, prefetch thumbnails and full-size images
// for the first N images in that gallery using <link rel="prefetch"> during idle time.
const prefetchedGalleries = new Set();

const prefetchGalleryImages = (galleryId) => {
  if (prefetchedGalleries.has(galleryId)) return; // already queued
  prefetchedGalleries.add(galleryId);

  const galleryImageData = store.get('galleryImageData') || {};
  const images = galleryImageData[galleryId] || [];
  const gallery = galleries[galleryId];
  if (!gallery || images.length === 0) return;

  const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : setTimeout;
  const MAX_PREFETCH = 10;
  const toPrefetch = images.slice(0, MAX_PREFETCH);

  schedule(() => {
    toPrefetch.forEach(img => {
      // Prefetch thumbnail
      const thumbLink = document.createElement('link');
      thumbLink.rel = 'prefetch';
      thumbLink.as = 'image';
      thumbLink.href = createThumbnailUrl(gallery.dir, img.imageData);
      document.head.appendChild(thumbLink);

      // Prefetch full-size image
      const fullLink = document.createElement('link');
      fullLink.rel = 'prefetch';
      fullLink.as = 'image';
      fullLink.href = createImageUrl(gallery.dir, img.imageData);
      document.head.appendChild(fullLink);
    });
    console.log(`🔮 Prefetched ${toPrefetch.length} thumbnails + full images for ${galleryId}`);
  });
};

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

// Fallback manifest generator (same as original)
const generateFallbackManifest = () => {
  const manifest = {};
  const defaultExtensions = {
    LoW: 'JPEG',
    SoL: 'JPEG',
    R: 'JPEG',
    SA: 'JPEG'
  };
  Object.keys(galleries).forEach(key => {
    const dir = galleries[key].dir;
    const ext = defaultExtensions[dir] || 'JPEG';
    manifest[dir] = [];
    for (let i = 1; i <= 50; i++) {
      manifest[dir].push({
        index: i,
        ext: ext,
        originalName: `${dir}-${i}.${ext}`,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        orientation: 'horizontal',
        aspectDecimal: 16/9
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
      aspectRatio: imageData.aspectDecimal || (imageData.width && imageData.height ? imageData.width / imageData.height : 16/9),
      imageData: imageData
    };
  });

  // Update store
  const galleryImageData = store.get('galleryImageData') || {};
  galleryImageData[galleryKey] = images;
  store.set('galleryImageData', galleryImageData);
  return images;
};

// Get most liked image for cover
const getMostLikedImageUrl = (galleryKey) => {
  const galleryImageData = store.get('galleryImageData') || {};
  const images = galleryImageData[galleryKey];
  if (!images || images.length === 0) return '';
  const sorted = stableSortByLikes(images);
  const gallery = galleries[galleryKey];
  return createThumbnailUrl(gallery.dir, sorted[0].imageData);
};

// Update gallery counts in UI
const refreshGalleryCounts = () => {
  const galleryImageData = store.get('galleryImageData') || {};
  Object.keys(galleries).forEach(key => {
    const countElement = dom[`${key}Count`];
    if (countElement && galleryImageData[key]) {
      const count = galleryImageData[key].length;
      const totalLikes = galleryImageData[key].reduce((sum, img) => sum + (img.likes || 0), 0);
      countElement.textContent = `${count} Works ${totalLikes} Likes`;
    }
  });
};

// Refresh gallery cover images
const refreshGalleryCovers = () => {
  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    if (cover) {
      const mostLikedUrl = getMostLikedImageUrl(key);
      if (mostLikedUrl) {
        cover.style.backgroundImage = `url(${mostLikedUrl})`;
        cover.classList.add('lazy-loaded');
        delete cover.dataset.bg;
      }
    }
  });
};

// Setup gallery selector (cover images, counts)
const setupGallerySelector = async () => {
  console.log('🔄 Setting up gallery selector...');

  // Load data for all galleries
  await Promise.all(Object.keys(galleries).map(key => loadGalleryData(key)));

  // Setup cover images with lazy observer
  const coverObserver = createObserver({
    targets: '.gallery-cover[data-gallery]',
    rootMargin: '50px',
    once: true,
    onIntersect: (entry) => {
      const cover = entry.target;
      const bgUrl = cover.dataset.bg;
      if (bgUrl) {
        const img = new Image();
        img.onload = () => {
          cover.style.backgroundImage = `url(${bgUrl})`;
          cover.classList.add('lazy-loaded');
          delete cover.dataset.bg;
        };
        img.src = bgUrl;
      }
    }
  });

  // Set data-bg for each cover
  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    const mostLikedUrl = getMostLikedImageUrl(key);
    if (cover && mostLikedUrl) {
      cover.dataset.bg = mostLikedUrl;
      coverObserver.observe(cover);
    }
  });

  // Update counts
  refreshGalleryCounts();

  // Attach click handlers with AbortController
  const { signal } = abortController;
  document.querySelectorAll('.gallery-cover').forEach(cover => {
    cover.addEventListener('click', function() {
      const galleryId = this.dataset.gallery;
      bus.emit('gallery:open', galleryId);
    }, { signal });
  });

  console.log('✅ Gallery selector setup complete');
};

// Load gallery content into masonry grid
const loadGalleryContent = (galleryId, options = {}) => {
  const { preserveScroll = false, showLoading = true, useCache = false } = options;
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

  // Disconnect previous masonry observer before replacing DOM
  if (currentMasonryObserver) {
    currentMasonryObserver.disconnect();
    currentMasonryObserver = null;
  }

  // ── DOM Cache Restore Path ──────────────────────────────────────────
  // If caller opted in (useCache) and we have a cached fragment, skip the
  // entire build + lazy-load pipeline — just re-attach the nodes.
  if (useCache && galleryDomCache.has(galleryId)) {
    console.log(`♻️ Restoring cached gallery: ${galleryId}`);
    masonryGrid.innerHTML = '';
    const cached = galleryDomCache.get(galleryId);
    masonryGrid.appendChild(cached);  // moves nodes from fragment → grid
    galleryDomCache.delete(galleryId); // fragment is now empty

    // Keep currentGalleryImages in sync (needed for modal navigation)
    const sortedImages = stableSortByLikes(images);
    store.set('currentGalleryImages', sortedImages);

    // Update header
    if (dom.currentGalleryTitle) dom.currentGalleryTitle.textContent = gallery.title;
    if (dom.currentGallerySubtitle) dom.currentGallerySubtitle.textContent = gallery.subtitle;

    // Scroll is already set by navigation (from galleryScrollPositions).
    // Do NOT reset it here — just signal content is ready.
    if (showLoading && dom.loadingIndicator) {
      setTimeout(() => dom.loadingIndicator.classList.remove('active'), 100);
    }
    setTimeout(() => bus.emit('gallery:contentLoaded', galleryId), 100);
    return;
  }

  // ── Fresh Build Path (original logic) ───────────────────────────────
  masonryGrid.innerHTML = '';

  const sortedImages = stableSortByLikes(images);
  store.set('currentGalleryImages', sortedImages);

  // Create masonry observer for lazy loading
  const masonryObserver = createObserver({
    rootMargin: '0px',
    once: true,
    onIntersect: (entry) => {
      const item = entry.target;
      const bgUrl = item.dataset.bg;
      if (bgUrl) {
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
    // Set thumbnail as background image
    masonryItem.dataset.bg = createThumbnailUrl(gallery.dir, image.imageData);
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
    masonryObserver.observe(masonryItem);
  });

  // Update header
  if (dom.currentGalleryTitle) dom.currentGalleryTitle.textContent = gallery.title;
  if (dom.currentGallerySubtitle) dom.currentGallerySubtitle.textContent = gallery.subtitle;

  if (!preserveScroll) {
    // Reset scroll only if not preserving
    store.set('scrollX', 0);
    store.set('scrollY', 0);
  }

  if (showLoading && dom.loadingIndicator) {
    setTimeout(() => {
      dom.loadingIndicator.classList.remove('active');
    }, 100);
  }

  setTimeout(() => {
    bus.emit('gallery:contentLoaded', galleryId);
  }, 100);
};

// Public function to re‑fetch gallery data and refresh UI
const updateGalleryData = (galleryId) => {
  loadGalleryData(galleryId);
  refreshGalleryCounts();
  refreshGalleryCovers();
};

// Public init
export const initGallery = async () => {
  console.log('🖼️ Initializing gallery module...');

  abortController = new AbortController();

  // Load manifest (or fallback)
  try {
    await loadManifest();
  } catch {
    generateFallbackManifest();
  }

  // Setup selector UI
  await setupGallerySelector();

  // Subscribe to events (store unsubscribers for cleanup)
  busUnsubs.push(
    bus.on('gallery:open', (galleryId) => {
      // State is owned by navigation module — gallery only handles rendering
      if (dom.loadingIndicator) dom.loadingIndicator.classList.add('active');
      if (dom.gallerySelector) dom.gallerySelector.classList.add('hidden');
      document.querySelector('.site-intro')?.classList.add('hidden');
      document.querySelector('.terms-footer')?.classList.add('hidden');

      // Check if we can restore from DOM cache (skip heavy rebuild)
      const hasCachedDom = galleryDomCache.has(galleryId);

      // Double rAF to ensure spinner shows
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            loadGalleryContent(galleryId, {
              preserveScroll: hasCachedDom, // preserve scroll when restoring cache
              showLoading: true,
              useCache: true               // allow cache restore
            });
            if (dom.loadingIndicator) dom.loadingIndicator.classList.remove('active');
            if (dom.galleryContent) dom.galleryContent.classList.add('active');
          }, TRANSITION_MS);
        });
      });
    })
  );

  // ── Cache DOM on gallery close ────────────────────────────────────
  // Navigation emits 'gallery:close' with the galleryId just before hiding.
  busUnsubs.push(
    bus.on('gallery:close', (galleryId) => {
      if (galleryId) {
        cacheGalleryDom(galleryId);
      }
    })
  );

  // ── Prefetch images for the current gallery after content loads ─────
  busUnsubs.push(
    bus.on('gallery:contentLoaded', (currentGalleryId) => {
      prefetchGalleryImages(currentGalleryId);
    })
  );

  busUnsubs.push(
    bus.on('consent:applied', () => {
      // Invalidate all cached DOM — likes data changed
      galleryDomCache.clear();
      // Refresh gallery data (likes may have changed)
      Object.keys(galleries).forEach(key => loadGalleryData(key));
      refreshGalleryCounts();
      refreshGalleryCovers();
      // If gallery is open, refresh its content
      if (store.get('isGalleryOpen')) {
        loadGalleryContent(store.get('currentGallery'), { preserveScroll: true, showLoading: false });
      }
    })
  );

  // Listen for like updates — now includes galleryId
  busUnsubs.push(
    bus.on('like:updated', ({ galleryId }) => {
      // Invalidate cached DOM for this gallery — sort order may have changed
      galleryDomCache.delete(galleryId);
      // Also clear saved scroll position since sort order changed
      const positions = store.get('galleryScrollPositions') || {};
      if (positions[galleryId]) {
        delete positions[galleryId];
        store.set('galleryScrollPositions', { ...positions });
      }

      updateGalleryData(galleryId);
      // If this gallery is currently open, re‑render with scroll preserved
      if (store.get('isGalleryOpen') && store.get('currentGallery') === galleryId) {
        loadGalleryContent(galleryId, { preserveScroll: true, showLoading: false });
      }
    })
  );
};

// Cleanup
export const destroyGallery = () => {
  abortController?.abort();
  abortController = null;
  if (currentMasonryObserver) {
    currentMasonryObserver.disconnect();
    currentMasonryObserver = null;
  }
  galleryDomCache.clear();
  prefetchedGalleries.clear();
  busUnsubs.forEach(unsub => unsub());
  busUnsubs.length = 0;
};