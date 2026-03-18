// js/modules/gallery.js
// Gallery grid, masonry layout, lazy loading, cover images
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

// Computed display order per gallery key — populated by computeDisplayOrder.
// Both the cover image and the grid read from this map so they are always in sync.
const displayOrderCache = {};

// Session shuffle order — computed ONCE per session per gallery on first load.
// Subsequent calls to computeDisplayOrder reuse this base order so that:
//   - images don't jump positions when consent changes mid-session
//   - liked images rise to the top while 0-like images stay in their original places
const sessionShuffleCache = {};

// Fisher-Yates shuffle — returns a new shuffled array, does not mutate input
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Stable sort by likes — equal-likes items keep their original manifest order
const stableSortByLikes = (items) => {
  return [...items].sort((a, b) => {
    if (b.likes !== a.likes) return b.likes - a.likes;
    return a.originalIndex - b.originalIndex;
  });
};

// Compute and store the display order for a gallery.
// The session shuffle is established once on first call and never changes.
// Subsequent calls (e.g. after consent or a like update) update likes data
// but preserve the base shuffle order so nothing jumps unexpectedly.
const computeDisplayOrder = (galleryKey) => {
  const galleryImageData = store.get('galleryImageData') || {};
  const images = galleryImageData[galleryKey];
  if (!images || images.length === 0) {
    displayOrderCache[galleryKey] = [];
    return [];
  }

  // Establish the session shuffle once — reuse on every subsequent call
  if (!sessionShuffleCache[galleryKey]) {
    sessionShuffleCache[galleryKey] = shuffle(images);
  }

  const functionalEnabled = store.get('functionalCookiesEnabled');

  if (!functionalEnabled) {
    // Cookies off: return the stable session shuffle, updated with fresh image refs
    const imageByUrl = new Map(images.map(img => [img.url, img]));
    displayOrderCache[galleryKey] = sessionShuffleCache[galleryKey]
      .map(img => imageByUrl.get(img.url))
      .filter(Boolean);
  } else {
    // Cookies on: liked images sorted to front, 0-like images in session shuffle order
    const imageByUrl = new Map(images.map(img => [img.url, img]));

    // Rebuild session order with fresh data (likes may have changed)
    const stableOrder = sessionShuffleCache[galleryKey]
      .map(img => imageByUrl.get(img.url))
      .filter(Boolean);

    const liked   = stableSortByLikes(stableOrder.filter(img => img.likes > 0));
    const unliked = stableOrder.filter(img => img.likes === 0);

    displayOrderCache[galleryKey] = [...liked, ...unliked];
  }

  return displayOrderCache[galleryKey];
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

// Fallback manifest — returns empty galleries rather than phantom image URLs
// that would 404 silently and leave broken invisible slots in the grid.
const generateFallbackManifest = () => {
  const manifest = {};
  Object.keys(galleries).forEach(key => {
    const dir = galleries[key].dir;
    manifest[dir] = [];
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

  // Recompute display order so cover and grid stay in sync
  computeDisplayOrder(galleryKey);

  return images;
};

// Get the cover image URL — always index 0 of the cached display order
const getCoverImageUrl = (galleryKey) => {
  const sorted = displayOrderCache[galleryKey];
  if (!sorted || sorted.length === 0) return '';
  const gallery = galleries[galleryKey];
  return createThumbnailUrl(gallery.dir, sorted[0].imageData);
};

// Update gallery counts in UI.
// Pass a specific galleryId to only refresh that gallery's count element —
// avoids touching all four on every like update when only one changed.
const refreshGalleryCounts = (galleryId = null) => {
  const galleryImageData = store.get('galleryImageData') || {};
  const functionalEnabled = store.get('functionalCookiesEnabled');
  const keys = galleryId ? [galleryId] : Object.keys(galleries);

  keys.forEach(key => {
    const countElement = dom[`${key}Count`];
    if (countElement && galleryImageData[key]) {
      const count = galleryImageData[key].length;
      if (functionalEnabled) {
        const totalLikes = galleryImageData[key].reduce((sum, img) => sum + (img.likes || 0), 0);
        countElement.textContent = totalLikes > 0
          ? `${count} Works & ${totalLikes} Likes`
          : `${count} Works`;
      } else {
        countElement.textContent = `${count} Works`;
      }
    }
  });
};

// Refresh gallery cover images
const refreshGalleryCovers = () => {
  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    if (cover) {
      const coverUrl = getCoverImageUrl(key);
      if (coverUrl) {
        cover.style.backgroundImage = `url(${coverUrl})`;
        cover.classList.add('lazy-loaded');
        delete cover.dataset.bg;
      }
    }
  });
};

// Setup gallery selector (cover images, counts)
const setupGallerySelector = async () => {
  console.log('🔄 Setting up gallery selector...');

  // Load data for all galleries — also computes initial display order per gallery
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

  // Set data-bg for each cover using the cached display order
  Object.keys(galleries).forEach(key => {
    const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
    const coverUrl = getCoverImageUrl(key);
    if (cover && coverUrl) {
      cover.dataset.bg = coverUrl;
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

  // Disconnect previous masonry observer before replacing DOM
  if (currentMasonryObserver) {
    currentMasonryObserver.disconnect();
    currentMasonryObserver = null;
  }

  masonryGrid.innerHTML = '';

  // Use the cached display order — same order the cover image uses
  const sortedImages = displayOrderCache[galleryId] || computeDisplayOrder(galleryId);
  store.set('currentGalleryImages', sortedImages);

  // Create masonry observer for lazy loading
  const masonryObserver = createObserver({
    rootMargin: '0px',
    once: true,
    onIntersect: (entry) => {
      const item = entry.target;
      const img = item.querySelector('img');
      const imgUrl = item.dataset.imgUrl;
      if (!img || !imgUrl) return;

      // Use imageCache — synchronous hit avoids any flicker on revisit
      if (imageCache.has(imgUrl)) {
        img.src = imageCache.get(imgUrl);
        item.classList.add('lazy-loaded');
        delete item.dataset.imgUrl;
      } else {
        imageCache.load(imgUrl)
          .then(blobUrl => {
            img.src = blobUrl;
            item.classList.add('lazy-loaded');
            delete item.dataset.imgUrl;
          })
          .catch(() => {
            // Fallback to raw URL on error
            img.src = imgUrl;
            item.classList.add('lazy-error');
            delete item.dataset.imgUrl;
          });
      }
    }
  });
  currentMasonryObserver = masonryObserver;

  const functionalEnabled = store.get('functionalCookiesEnabled');

  sortedImages.forEach((image, index) => {
    const masonryItem = document.createElement('div');
    let orientation = 'square';
    if (image.aspectRatio > 1.2) orientation = 'horizontal';
    else if (image.aspectRatio < 0.8) orientation = 'vertical';

    masonryItem.className = `masonry-item ${orientation}`;
    // Cap animation delay so images deep in the grid don't wait unreasonably long
    masonryItem.style.animationDelay = `${Math.min(index * 0.05, 1.5)}s`;
    // Store image URL for lazy loading
    masonryItem.dataset.imgUrl = createThumbnailUrl(gallery.dir, image.imageData);
    masonryItem.dataset.imageId = index;

    // Create img element for SEO-friendly image display
    const imgElement = document.createElement('img');
    imgElement.className = 'masonry-img';
    imgElement.alt = `${gallery.title} - Photo ${image.imageData.index}`;
    imgElement.loading = 'lazy';
    // Set width/height attributes when available for better CLS performance
    if (image.imageData.width) {
      imgElement.width = image.imageData.width;
    }
    if (image.imageData.height) {
      imgElement.height = image.imageData.height;
    }
    masonryItem.appendChild(imgElement);

    const overlay = document.createElement('div');
    overlay.className = 'item-overlay';
    overlay.style.opacity = '0';

    // On mouseenter, read likes from live cache so the count is always current
    // even if someone liked the image after the grid was last rendered.
    masonryItem.addEventListener('mouseenter', () => {
      const likesEl = overlay.querySelector('.item-likes');
      if (likesEl && store.get('functionalCookiesEnabled')) {
        const docId = getDocIdFromUrl(image.url);
        const liveCount = (store.get('likesCache') || {})[docId] || 0;
        if (liveCount > 0) {
          likesEl.textContent = `♥ ${liveCount}`;
          likesEl.style.display = '';
        } else {
          likesEl.style.display = 'none';
        }
      }
      overlay.style.opacity = '1';
    });
    masonryItem.addEventListener('mouseleave', () => { overlay.style.opacity = '0'; });

    // Build overlay with initial like count — mouseenter keeps it fresh thereafter
    overlay.innerHTML = `
      <div class="item-category">${gallery.title}</div>
      <div class="item-title">Image ${image.imageData.index}</div>
      <div class="item-likes" style="${functionalEnabled && image.likes > 0 ? '' : 'display:none'}">♥ ${image.likes}</div>
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

// Public function to re-fetch gallery data and refresh UI
const updateGalleryData = (galleryId) => {
  loadGalleryData(galleryId);
  // Only refresh the count for the gallery that changed
  refreshGalleryCounts(galleryId);
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

      // Double rAF to ensure spinner shows
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
      // Refresh all gallery data (likes may have changed) — session shuffle is preserved
      Object.keys(galleries).forEach(key => loadGalleryData(key));
      refreshGalleryCounts();
      refreshGalleryCovers();
      // If gallery is open, refresh its content
      if (store.get('isGalleryOpen')) {
        loadGalleryContent(store.get('currentGallery'), { preserveScroll: true, showLoading: false });
      }
    })
  );

  // Listen for like updates — includes url and galleryId from firebase.js
  busUnsubs.push(
    bus.on('like:updated', ({ galleryId, url }) => {
      // Invalidate both the full-size and thumbnail blob URLs for this image
      // so the next load re-fetches a fresh copy (though the image bytes
      // haven't changed — this just keeps the cache consistent with the
      // sort re-render that follows).
      if (url) {
        imageCache.invalidate(url);
        // Thumbnail lives under /images/thumbnails/ vs /images/
        const thumbUrl = url.replace('/images/', '/images/thumbnails/');
        imageCache.invalidate(thumbUrl);
      }
      updateGalleryData(galleryId);
      // If this gallery is currently open, re-render with scroll preserved
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
  busUnsubs.forEach(unsub => unsub());
  busUnsubs.length = 0;
};
