// js/modules/gallery.js
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom, clearDomCache } from '../dom-elements.js';
import { createObserver } from '../lib/create-observer.js';
import { withErrorHandling } from '../lib/error-handler.js';
import { NAV_EVENTS } from '../lib/navigation-fsm.js';

// ---------- Constants ----------
export const GALLERIES = {
    low: { title: 'Language of Windows', dir: 'LoW', subtitle: 'Exploring the silent stories behind glass', color: '#FF6B35' },
    sol: { title: 'Snapshots of Life', dir: 'SoL', subtitle: 'Capturing the raw essence of everyday moments', color: '#9D4EDD' },
    r:   { title: 'Reflections', dir: 'R',   subtitle: 'Where reality meets its mirror image', color: '#06FFA5' },
    sa:  { title: 'Street Art', dir: 'SA',  subtitle: 'Urban expressions and vibrant creativity', color: '#FFD23F' }
};

const GITHUB_OWNER = 'gro-lab';
const GITHUB_REPO = 'thenonconformist';
const GITHUB_BRANCH = 'main';

// ---------- State ----------
let masonryObserver = null;
let scrollListenersAttached = false;

// ---------- Helpers ----------
function stableSortByLikes(items) {
    return [...items].sort((a, b) => {
        if (b.likes !== a.likes) return b.likes - a.likes;
        return a.originalIndex - b.originalIndex;
    });
}

async function loadManifest() {
    const manifestUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/images.json`;
    try {
        const res = await fetch(manifestUrl);
        if (!res.ok) throw new Error('Manifest fetch failed');
        const manifest = await res.json();
        store.set('imageManifest', manifest);
        return manifest;
    } catch {
        // Fallback manifest
        const fallback = {};
        Object.keys(GALLERIES).forEach(key => {
            const dir = GALLERIES[key].dir;
            fallback[dir] = [];
            for (let i = 1; i <= 50; i++) {
                fallback[dir].push({
                    index: i,
                    ext: 'JPEG',
                    originalName: `${dir}-${i}.JPEG`,
                    width: 1920, height: 1080, aspectRatio: '16:9', orientation: 'horizontal', aspectDecimal: 16/9
                });
            }
        });
        store.set('imageManifest', fallback);
        return fallback;
    }
}

function createImageUrl(dir, imageData) {
    const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
    return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/images/${dir}/${filename}`;
}

function createThumbnailUrl(dir, imageData) {
    const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
    return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/images/thumbnails/${dir}/${filename}`;
}

function getDocIdFromUrl(url) {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
}

// ---------- Load gallery data (once) ----------
async function loadGalleryData(galleryKey) {
    const gallery = GALLERIES[galleryKey];
    const dir = gallery.dir;
    const manifest = store.get('imageManifest');
    const imageList = manifest[dir] || [];
    const likesCache = store.get('likesCache') || {};

    const images = imageList.map((imageData, originalIndex) => {
        const url = createImageUrl(dir, imageData);
        const docId = getDocIdFromUrl(url);
        const likes = likesCache[docId] ?? 0;
        return {
            url,
            likes,
            originalIndex,
            gallery: galleryKey,
            title: gallery.title,
            alt: `${gallery.title} - Image ${imageData.index}`,
            aspectRatio: imageData.aspectDecimal || (imageData.orientation === 'vertical' ? 9/16 : 16/9),
            imageData
        };
    });

    // Update store
    const galleryData = store.get('galleryImageData');
    galleryData[galleryKey] = images;
    store.set('galleryImageData', { ...galleryData });
    return images;
}

// ---------- Most liked image for cover ----------
function getMostLikedImageUrl(galleryKey) {
    const galleryData = store.get('galleryImageData')[galleryKey];
    if (!galleryData?.length) return '';
    const sorted = stableSortByLikes(galleryData);
    const dir = GALLERIES[galleryKey].dir;
    return createThumbnailUrl(dir, sorted[0].imageData);
}

// ---------- Render gallery selector covers (lazy) ----------
async function renderGalleryCovers() {
    const observer = createObserver({
        targets: '.gallery-cover',
        rootMargin: '50px',
        once: true,
        onIntersect: (entry) => {
            const cover = entry.target;
            const galleryKey = cover.dataset.gallery;
            const mostLiked = getMostLikedImageUrl(galleryKey);
            if (mostLiked) {
                cover.style.backgroundImage = `url(${mostLiked})`;
                cover.classList.add('lazy-loaded');
            }
        }
    });
    store.set('coverObserver', observer);
}

// ---------- Update counts on selector ----------
function updateGalleryCounts() {
    const galleryData = store.get('galleryImageData');
    Object.keys(GALLERIES).forEach(key => {
        const el = dom[`count${key.charAt(0).toUpperCase() + key.slice(1)}`]; // countLow, countSol...
        if (el && galleryData[key]) {
            const count = galleryData[key].length;
            const totalLikes = galleryData[key].reduce((sum, img) => sum + (img.likes || 0), 0);
            el.textContent = `${count} Works • ${totalLikes} Likes`;
        }
    });
}

// ---------- Canvas navigation ----------
function calculateScrollLimits() {
    const grid = dom.masonryGrid;
    const canvas = dom.infiniteCanvas;
    const viewport = dom.galleryContent;
    if (!grid || !canvas || !viewport) return;

    const gridRect = grid.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    const contentWidth = gridRect.width;
    const contentHeight = gridRect.height;
    const viewportWidth = viewportRect.width;
    const viewportHeight = viewportRect.height;

    const style = window.getComputedStyle(canvas);
    const padL = parseInt(style.paddingLeft) || 20;
    const padR = parseInt(style.paddingRight) || 20;
    const padT = parseInt(style.paddingTop) || 120;
    const padB = parseInt(style.paddingBottom) || 80;

    const scrollX = Math.max(0, contentWidth - viewportWidth + padL + padR);
    const scrollY = Math.max(0, contentHeight - viewportHeight + padT + padB);

    store.set('scrollLimits', {
        minX: -scrollX,
        maxX: scrollX,
        minY: -scrollY,
        maxY: scrollY
    });
}

function updateCanvasTransform() {
    const container = dom.canvasTransform;
    if (!container) return;
    const { scrollX, scrollY } = store.get('scrollLimits'); // actually store has scrollX, scrollY
    container.style.transform = `translate(${store.get('scrollX')}px, ${store.get('scrollY')}px)`;
}

function startDrag(e) {
    if (!store.get('isGalleryOpen')) return;
    store.set('isDragging', true);
    store.set('dragStart', { x: e.clientX - store.get('scrollX'), y: e.clientY - store.get('scrollY') });
    dom.infiniteCanvas.style.cursor = 'grabbing';
    e.preventDefault();
}

function onDrag(e) {
    if (!store.get('isDragging')) return;
    const start = store.get('dragStart');
    let newX = e.clientX - start.x;
    let newY = e.clientY - start.y;
    const limits = store.get('scrollLimits');
    newX = Math.max(limits.minX, Math.min(limits.maxX, newX));
    newY = Math.max(limits.minY, Math.min(limits.maxY, newY));
    store.set('scrollX', newX);
    store.set('scrollY', newY);
    updateCanvasTransform();
}

function stopDrag() {
    store.set('isDragging', false);
    if (dom.infiniteCanvas) dom.infiniteCanvas.style.cursor = '';
}

function setupCanvasEventListeners() {
    if (scrollListenersAttached) return;
    const canvas = dom.infiniteCanvas;
    if (!canvas) return;

    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            store.set('isDragging', true);
            store.set('dragStart', {
                x: e.touches[0].clientX - store.get('scrollX'),
                y: e.touches[0].clientY - store.get('scrollY')
            });
        }
    }, { passive: false });

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', (e) => {
        if (store.get('isDragging') && e.touches.length === 1) {
            onDrag(e.touches[0]);
        }
    }, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);

    // Wheel pan
    canvas.addEventListener('wheel', (e) => {
        if (!store.get('isGalleryOpen')) return;
        e.preventDefault();
        const newX = store.get('scrollX') - e.deltaX * 0.5;
        const newY = store.get('scrollY') - e.deltaY * 0.5;
        const limits = store.get('scrollLimits');
        store.set('scrollX', Math.max(limits.minX, Math.min(limits.maxX, newX)));
        store.set('scrollY', Math.max(limits.minY, Math.min(limits.maxY, newY)));
        updateCanvasTransform();
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (!store.get('isGalleryOpen') || !store.get('modal').hasAttribute('hidden')) return;
        const speed = 30;
        let { scrollX, scrollY } = store.state;
        switch(e.key) {
            case 'ArrowLeft':  scrollX += speed; break;
            case 'ArrowRight': scrollX -= speed; break;
            case 'ArrowUp':    scrollY += speed; break;
            case 'ArrowDown':  scrollY -= speed; break;
            case 'Escape':     bus.emit('ui:closeGallery'); return;
        }
        const limits = store.get('scrollLimits');
        store.set('scrollX', Math.max(limits.minX, Math.min(limits.maxX, scrollX)));
        store.set('scrollY', Math.max(limits.minY, Math.min(limits.maxY, scrollY)));
        updateCanvasTransform();
    });

    window.addEventListener('resize', () => {
        if (store.get('isGalleryOpen')) {
            calculateScrollLimits();
            updateCanvasTransform();
        }
    });

    scrollListenersAttached = true;
}

// ---------- Render masonry grid ----------
function renderMasonryGrid(galleryKey) {
    const images = store.get('galleryImageData')[galleryKey];
    if (!images?.length) return;

    destroyMasonryObserver();

    const grid = dom.masonryGrid;
    if (!grid) return;
    grid.innerHTML = '';

    const sorted = stableSortByLikes(images);
    store.set('currentGalleryImages', sorted);

    const observer = createObserver({
        targets: [], // will add dynamically
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
                img.src = bgUrl;
            }
            observer.unobserve(item);
        }
    });
    masonryObserver = observer;

    sorted.forEach((image, index) => {
        const item = document.createElement('div');
        let orientation = 'square';
        if (image.aspectRatio > 1.2) orientation = 'horizontal';
        else if (image.aspectRatio < 0.8) orientation = 'vertical';

        item.className = `masonry-item ${orientation}`;
        item.dataset.bg = image.url;
        item.dataset.imageId = image.url;

        const overlay = document.createElement('div');
        overlay.className = 'item-overlay';
        overlay.innerHTML = `
            <div class="item-category">${GALLERIES[galleryKey].title}</div>
            <div class="item-title">Image ${image.imageData.index}</div>
            <div class="item-likes">♥ ${image.likes}</div>
        `;

        item.appendChild(overlay);
        item.addEventListener('click', () => {
            bus.emit('photo:open', { url: image.url, galleryKey, index });
        });

        grid.appendChild(item);
        observer.observe(item);
    });

    // Reset scroll
    store.set('scrollX', 0);
    store.set('scrollY', 0);
    updateCanvasTransform();

    setTimeout(() => {
        calculateScrollLimits();
        updateCanvasTransform();
    }, 100);
    setTimeout(calculateScrollLimits, 500);
}

function destroyMasonryObserver() {
    if (masonryObserver) {
        masonryObserver.disconnect();
        masonryObserver = null;
    }
}

// ---------- Public API ----------
export async function initGallery() {
    await loadManifest();
    // Load data for all galleries (needs likesCache already)
    await Promise.all(Object.keys(GALLERIES).map(key => loadGalleryData(key)));

    renderGalleryCovers();
    updateGalleryCounts();

    // Attach click listeners to covers
    document.querySelectorAll('.gallery-cover').forEach(cover => {
        cover.addEventListener('click', function() {
            bus.emit('gallery:open', this.dataset.gallery);
        });
    });

    // Setup canvas listeners once
    setupCanvasEventListeners();

    // Back button listener
    dom.backButton?.addEventListener('click', () => bus.emit('ui:closeGallery'));

    // Subscribe to store changes for like count updates
    store.subscribe('likesCache', () => {
        // Reload gallery data if we have a current gallery
        const current = store.get('currentGallery');
        if (current) {
            loadGalleryData(current).then(() => {
                renderMasonryGrid(current);
                updateGalleryCounts();
                // also update cover images
                renderGalleryCovers();
            });
        } else {
            // just update counts on selector
            Object.keys(GALLERIES).forEach(key => loadGalleryData(key));
            updateGalleryCounts();
            renderGalleryCovers();
        }
    });
}

export function openGallery(galleryId) {
    // Remember scroll position
    store.set('homepageScrollY', window.scrollY || document.documentElement.scrollTop);

    store.set('currentGallery', galleryId);
    store.set('isGalleryOpen', true);

    // Update header texts
    if (dom.currentGalleryTitle) dom.currentGalleryTitle.textContent = GALLERIES[galleryId].title;
    if (dom.currentGallerySubtitle) dom.currentGallerySubtitle.textContent = GALLERIES[galleryId].subtitle;

    // Show loading spinner, then render
    dom.loadingIndicator?.classList.add('active');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            dom.gallerySelector?.classList.add('hidden');
            dom.siteIntro?.classList.add('hidden');
            dom.termsFooter?.classList.add('hidden');

            setTimeout(() => {
                renderMasonryGrid(galleryId);
                dom.loadingIndicator?.classList.remove('active');
                dom.galleryContent?.classList.add('active');
            }, 800);
        });
    });
}

export function closeGallery({ skipHistory = false } = {}) {
    if (!skipHistory) {
        bus.emit(NAV_EVENTS.CLOSE_GALLERY);
        return;
    }

    dom.loadingIndicator?.classList.add('active');
    destroyMasonryObserver();

    // Refresh counts and covers before showing selector
    updateGalleryCounts();
    renderGalleryCovers();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            dom.galleryContent?.classList.remove('active');

            setTimeout(() => {
                dom.gallerySelector?.classList.remove('hidden');
                dom.siteIntro?.classList.remove('hidden');
                dom.termsFooter?.classList.remove('hidden');
                store.set('currentGallery', null);
                store.set('isGalleryOpen', false);

                // Restore scroll
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

// ---------- Event bus wiring ----------
bus.on('gallery:open', (galleryId) => {
    openGallery(galleryId);
    bus.emit(NAV_EVENTS.OPEN_GALLERY, { galleryId });
});

bus.on('ui:closeGallery', (payload) => closeGallery(payload));
bus.on('ui:reopenGallery', () => {
    const galleryId = store.get('currentGallery');
    if (galleryId) openGallery(galleryId);
});