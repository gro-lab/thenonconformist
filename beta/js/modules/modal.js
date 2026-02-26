// js/modules/modal.js
// Modal lightbox with navigation, like functionality, and zoom & pan
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';
import { getDocIdFromUrl, clamp, getDistance } from '../lib/utils.js';

let currentAbortController = null;

// ==================== Zoom & Pan State ====================

/** Calculate the fit-to-screen scale for the current image */
const calculateFitScale = () => {
  const container = dom.modalImgContainer;
  const img = dom.modalImg;
  if (!container || !img) return 1;

  const containerW = container.clientWidth;
  const containerH = container.clientHeight;

  // Use natural dimensions from the loaded image
  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;

  // Also check manifest for accurate data
  const currentPhoto = store.get('currentPhoto');
  const manifest = store.get('imageManifest') || {};
  let imgW = naturalW;
  let imgH = naturalH;

  // Try to find dimensions from manifest
  if (currentPhoto && manifest) {
    for (const dir of Object.keys(manifest)) {
      const found = manifest[dir]?.find?.(entry => currentPhoto.includes(entry.originalName || `${dir}-${entry.index}`));
      if (found) {
        imgW = found.width || naturalW;
        imgH = found.height || naturalH;
        break;
      }
    }
  }

  // Fit within container maintaining aspect ratio
  const scaleX = containerW / imgW;
  const scaleY = containerH / imgH;
  return Math.min(scaleX, scaleY, 1); // never stretch beyond 100%
};

/** Get the maximum zoom (100% of natural resolution) */
const calculateMaxZoom = () => {
  const fitScale = calculateFitScale();
  if (fitScale <= 0) return 1;
  // Max zoom = 1.0 (natural size) expressed relative to fit scale
  // e.g., if fitScale = 0.5, max zoom = 1/0.5 = 2x the fit scale
  return 1 / fitScale;
};

/** Apply current zoom and pan transforms to the image */
const applyTransform = (smooth = false) => {
  const img = dom.modalImg;
  if (!img) return;

  const zoom = store.get('modalZoom') || 1;
  const panX = store.get('modalPanX') || 0;
  const panY = store.get('modalPanY') || 0;

  if (smooth) {
    img.style.transition = 'transform 0.3s ease';
  } else {
    img.style.transition = 'none';
  }

  img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
};

/** Reset zoom to fit-to-screen */
const resetZoom = (smooth = true) => {
  store.set('modalZoom', 1);
  store.set('modalPanX', 0);
  store.set('modalPanY', 0);
  store.set('isModalDragging', false);
  applyTransform(smooth);
  updateZoomUI();
  updateCursor();
  bus.emit('modal:zoomChanged', { zoom: 1 });
};

/** Check if currently zoomed beyond fit-to-screen */
const isZoomed = () => {
  return (store.get('modalZoom') || 1) > 1.01; // small epsilon for float comparison
};

/** Clamp pan values to keep image within reasonable bounds */
const clampPan = (panX, panY) => {
  const img = dom.modalImg;
  const container = dom.modalImgContainer;
  if (!img || !container) return { panX, panY };

  const zoom = store.get('modalZoom') || 1;
  const fitScale = calculateFitScale();
  const currentScale = fitScale * zoom;

  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;
  const scaledW = naturalW * currentScale;
  const scaledH = naturalH * currentScale;

  const containerW = container.clientWidth;
  const containerH = container.clientHeight;

  // If the scaled image is smaller than container, no pan allowed
  const maxPanX = Math.max(0, (scaledW - containerW) / 2);
  const maxPanY = Math.max(0, (scaledH - containerH) / 2);

  return {
    panX: clamp(panX, -maxPanX, maxPanX),
    panY: clamp(panY, -maxPanY, maxPanY)
  };
};

/** Zoom to a specific level, optionally around a focal point */
const zoomTo = (newZoom, focalX = null, focalY = null, smooth = true) => {
  const maxZoom = calculateMaxZoom();
  const clampedZoom = clamp(newZoom, 1, maxZoom);

  const oldZoom = store.get('modalZoom') || 1;
  let panX = store.get('modalPanX') || 0;
  let panY = store.get('modalPanY') || 0;

  // If focal point provided, adjust pan to zoom toward that point
  if (focalX !== null && focalY !== null && oldZoom !== clampedZoom) {
    const container = dom.modalImgContainer;
    if (container) {
      const rect = container.getBoundingClientRect();
      // Focal point relative to container center
      const fx = focalX - rect.left - rect.width / 2;
      const fy = focalY - rect.top - rect.height / 2;

      const zoomRatio = clampedZoom / oldZoom;
      panX = fx - zoomRatio * (fx - panX);
      panY = fy - zoomRatio * (fy - panY);
    }
  }

  // If zooming back to 1, reset pan
  if (clampedZoom <= 1.01) {
    panX = 0;
    panY = 0;
  }

  const clamped = clampPan(panX, panY);

  store.set('modalZoom', clampedZoom);
  store.set('modalPanX', clamped.panX);
  store.set('modalPanY', clamped.panY);

  applyTransform(smooth);
  updateZoomUI();
  updateCursor();
  bus.emit('modal:zoomChanged', { zoom: clampedZoom });
};

/** Step zoom in by a factor */
const zoomIn = () => {
  const current = store.get('modalZoom') || 1;
  zoomTo(current * 1.3, null, null, true);
};

/** Step zoom out by a factor */
const zoomOut = () => {
  const current = store.get('modalZoom') || 1;
  zoomTo(current / 1.3, null, null, true);
};

/** Update the zoom percentage indicator */
const updateZoomUI = () => {
  const zoomIndicator = dom.zoomIndicator;
  const zoomInBtn = dom.zoomInBtn;
  const zoomOutBtn = dom.zoomOutBtn;

  const zoom = store.get('modalZoom') || 1;
  const fitScale = calculateFitScale();
  const actualPercent = Math.round(fitScale * zoom * 100);
  const maxZoom = calculateMaxZoom();

  if (zoomIndicator) {
    if (isZoomed()) {
      zoomIndicator.textContent = `${actualPercent}%`;
      zoomIndicator.classList.add('visible');
    } else {
      zoomIndicator.classList.remove('visible');
    }
  }

  // Disable buttons at limits
  if (zoomInBtn) {
    zoomInBtn.disabled = zoom >= maxZoom - 0.01;
  }
  if (zoomOutBtn) {
    zoomOutBtn.disabled = zoom <= 1.01;
  }
};

/** Update cursor based on zoom state */
const updateCursor = () => {
  const container = dom.modalImgContainer;
  if (!container) return;

  if (store.get('isModalDragging')) {
    container.style.cursor = 'grabbing';
  } else if (isZoomed()) {
    container.style.cursor = 'grab';
  } else {
    container.style.cursor = 'zoom-in';
  }
};

// ==================== Mouse Wheel Zoom ====================

const handleWheel = (e) => {
  if (!store.get('isModalOpen')) return;
  e.preventDefault();
  e.stopPropagation();

  const delta = e.deltaY > 0 ? 0.9 : 1.1; // scroll down = zoom out, up = zoom in
  const currentZoom = store.get('modalZoom') || 1;
  zoomTo(currentZoom * delta, e.clientX, e.clientY, false);
};

// ==================== Mouse Drag Pan ====================

let dragStartX = 0;
let dragStartY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;

const handleMouseDown = (e) => {
  if (!store.get('isModalOpen')) return;
  // Only pan if zoomed, and only on left click
  if (!isZoomed() || e.button !== 0) return;

  // Ignore clicks on controls
  if (e.target.closest('.modal-zoom-controls') ||
      e.target.closest('.like-btn') ||
      e.target.closest('.modal-nav-btn') ||
      e.target.closest('.modal-close')) return;

  e.preventDefault();
  store.set('isModalDragging', true);
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = store.get('modalPanX') || 0;
  dragStartPanY = store.get('modalPanY') || 0;
  updateCursor();
  bus.emit('modal:panStart');
};

const handleMouseMove = (e) => {
  if (!store.get('isModalDragging')) return;
  e.preventDefault();

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  const clamped = clampPan(dragStartPanX + dx, dragStartPanY + dy);
  store.set('modalPanX', clamped.panX);
  store.set('modalPanY', clamped.panY);
  applyTransform(false);
};

const handleMouseUp = () => {
  if (!store.get('isModalDragging')) return;
  store.set('isModalDragging', false);
  updateCursor();
  bus.emit('modal:panEnd');
};

// ==================== Double Click to Reset ====================

let lastClickTime = 0;
const handleDoubleClick = (e) => {
  if (!store.get('isModalOpen')) return;

  // Ignore clicks on controls
  if (e.target.closest('.modal-zoom-controls') ||
      e.target.closest('.like-btn') ||
      e.target.closest('.modal-nav-btn') ||
      e.target.closest('.modal-close')) return;

  const now = Date.now();
  if (now - lastClickTime < 300) {
    // Double click detected
    e.preventDefault();
    if (isZoomed()) {
      resetZoom(true);
    } else {
      // Zoom in to 2x or max, whichever is smaller
      const maxZoom = calculateMaxZoom();
      const targetZoom = Math.min(2, maxZoom);
      zoomTo(targetZoom, e.clientX, e.clientY, true);
    }
    lastClickTime = 0;
    return;
  }
  lastClickTime = now;
};

// ==================== Touch: Pinch Zoom & Pan ====================

let touchStartDistance = 0;
let touchStartZoom = 1;
let touchStartPanX = 0;
let touchStartPanY = 0;
let touchStartMidX = 0;
let touchStartMidY = 0;
let isTouchPanning = false;
let isPinching = false;
let lastTapTime = 0;
let touchStartSingleX = 0;
let touchStartSingleY = 0;

const handleTouchStart = (e) => {
  if (!store.get('isModalOpen')) return;

  // Ignore touches on controls
  if (e.target.closest('.modal-zoom-controls') ||
      e.target.closest('.like-btn') ||
      e.target.closest('.modal-nav-btn') ||
      e.target.closest('.modal-close')) return;

  if (e.touches.length === 2) {
    // Pinch start
    e.preventDefault();
    isPinching = true;
    isTouchPanning = false;
    touchStartDistance = getDistance(
      e.touches[0].clientX, e.touches[0].clientY,
      e.touches[1].clientX, e.touches[1].clientY
    );
    touchStartZoom = store.get('modalZoom') || 1;
    touchStartPanX = store.get('modalPanX') || 0;
    touchStartPanY = store.get('modalPanY') || 0;
    touchStartMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    touchStartMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  } else if (e.touches.length === 1) {
    // Check for double-tap
    const now = Date.now();
    if (now - lastTapTime < 300) {
      e.preventDefault();
      if (isZoomed()) {
        resetZoom(true);
      } else {
        const maxZoom = calculateMaxZoom();
        const targetZoom = Math.min(2, maxZoom);
        zoomTo(targetZoom, e.touches[0].clientX, e.touches[0].clientY, true);
      }
      lastTapTime = 0;
      return;
    }
    lastTapTime = now;

    // Single finger: pan if zoomed
    if (isZoomed()) {
      e.preventDefault();
      isTouchPanning = true;
      isPinching = false;
      store.set('isModalDragging', true);
      touchStartSingleX = e.touches[0].clientX;
      touchStartSingleY = e.touches[0].clientY;
      touchStartPanX = store.get('modalPanX') || 0;
      touchStartPanY = store.get('modalPanY') || 0;
      updateCursor();
      bus.emit('modal:panStart');
    }
    // If not zoomed, let the event propagate for swipe-to-navigate
  }
};

const handleTouchMove = (e) => {
  if (!store.get('isModalOpen')) return;

  if (isPinching && e.touches.length === 2) {
    e.preventDefault();
    const currentDistance = getDistance(
      e.touches[0].clientX, e.touches[0].clientY,
      e.touches[1].clientX, e.touches[1].clientY
    );
    const scale = currentDistance / touchStartDistance;
    const newZoom = touchStartZoom * scale;

    // Also pan based on midpoint movement
    const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    const container = dom.modalImgContainer;
    if (container) {
      const rect = container.getBoundingClientRect();
      const fx = touchStartMidX - rect.left - rect.width / 2;
      const fy = touchStartMidY - rect.top - rect.height / 2;

      const zoomRatio = newZoom / touchStartZoom;
      let panX = fx - zoomRatio * (fx - touchStartPanX);
      let panY = fy - zoomRatio * (fy - touchStartPanY);

      // Add midpoint movement delta
      panX += currentMidX - touchStartMidX;
      panY += currentMidY - touchStartMidY;

      const maxZoom = calculateMaxZoom();
      const clampedZoom = clamp(newZoom, 1, maxZoom);

      if (clampedZoom <= 1.01) {
        panX = 0;
        panY = 0;
      }

      const clamped = clampPan(panX, panY);

      store.set('modalZoom', clampedZoom);
      store.set('modalPanX', clamped.panX);
      store.set('modalPanY', clamped.panY);
      applyTransform(false);
      updateZoomUI();
      updateCursor();
    }
  } else if (isTouchPanning && e.touches.length === 1) {
    e.preventDefault();
    const dx = e.touches[0].clientX - touchStartSingleX;
    const dy = e.touches[0].clientY - touchStartSingleY;

    const clamped = clampPan(touchStartPanX + dx, touchStartPanY + dy);
    store.set('modalPanX', clamped.panX);
    store.set('modalPanY', clamped.panY);
    applyTransform(false);
  }
};

const handleTouchEnd = (e) => {
  if (isPinching && e.touches.length < 2) {
    isPinching = false;
    // If zoom fell below 1, snap back
    if ((store.get('modalZoom') || 1) < 1.01) {
      resetZoom(true);
    }
  }

  if (isTouchPanning && e.touches.length === 0) {
    isTouchPanning = false;
    store.set('isModalDragging', false);
    updateCursor();
    bus.emit('modal:panEnd');
  }
};

// ==================== Like Button ====================

// Update like button UI based on current photo
const updateLikeButton = () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;

  const likesCache = store.get('likesCache') || {};
  const docId = getDocIdFromUrl(currentPhoto);
  const likes = likesCache[docId] || 0;
  const likeCountEl = dom.likeCount;
  const heartEl = dom.likeBtn?.querySelector('.heart');

  if (likeCountEl) likeCountEl.textContent = likes;

  // Check if liked in localStorage (only if functional enabled)
  let isLiked = false;
  if (store.get('functionalCookiesEnabled')) {
    const likedKey = `liked_${docId}`;
    isLiked = localStorage.getItem(likedKey) === 'true';
  }

  if (heartEl) {
    heartEl.textContent = isLiked ? '♥' : '♡';
    if (isLiked) {
      dom.likeBtn?.classList.add('liked');
    } else {
      dom.likeBtn?.classList.remove('liked');
    }
  }
};

// ==================== Navigation ====================

// Navigate modal to previous/next image
const navigateModal = (direction) => {
  const currentIndex = store.get('currentPhotoIndex');
  const images = store.get('currentGalleryImages') || [];
  if (images.length === 0) return;

  // Reset zoom before navigating
  resetZoom(false);

  let newIndex;
  if (direction === 'prev') {
    newIndex = (currentIndex - 1 + images.length) % images.length;
  } else {
    newIndex = (currentIndex + 1) % images.length;
  }

  const nextImage = images[newIndex];
  store.set('currentPhoto', nextImage.url);
  store.set('currentPhotoIndex', newIndex);
  if (dom.modalImg) {
    dom.modalImg.src = nextImage.url;
    // Recalculate zoom UI once image loads
    dom.modalImg.onload = () => {
      updateZoomUI();
      updateCursor();
    };
  }

  updateLikeButton();
};

// ==================== Open / Close ====================

// Open modal
const openModal = ({ url, galleryId, index }) => {
  // Push history state so that back closes the modal
  history.pushState({ page: 'modal', gallery: galleryId }, '', window.location.href);

  store.set('currentPhoto', url);
  store.set('currentPhotoIndex', index);
  store.set('isModalOpen', true);

  // Reset zoom state
  store.set('modalZoom', 1);
  store.set('modalPanX', 0);
  store.set('modalPanY', 0);
  store.set('isModalDragging', false);

  if (dom.modalImg) {
    dom.modalImg.src = url;
    dom.modalImg.style.transform = 'translate(0px, 0px) scale(1)';
    dom.modalImg.style.transition = 'none';
    // Update zoom UI once image loads
    dom.modalImg.onload = () => {
      updateZoomUI();
      updateCursor();
    };
  }
  dom.modal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  updateLikeButton();
  updateZoomUI();
  updateCursor();

  // Show/hide navigation buttons based on image count
  const images = store.get('currentGalleryImages') || [];
  if (images.length <= 1) {
    if (dom.modalPrev) dom.modalPrev.style.display = 'none';
    if (dom.modalNext) dom.modalNext.style.display = 'none';
  } else {
    if (dom.modalPrev) dom.modalPrev.style.display = 'flex';
    if (dom.modalNext) dom.modalNext.style.display = 'flex';
  }
};

// Close modal (called only from popstate handler or internally when resetting)
const closeModal = () => {
  // Reset zoom state
  resetZoom(false);

  store.set('isModalOpen', false);
  store.set('currentPhoto', null);
  store.set('currentPhotoIndex', -1);
  dom.modal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
};

// ==================== Toggle Like ====================

const toggleLike = async () => {
  const currentPhoto = store.get('currentPhoto');
  if (!currentPhoto) return;
  if (!store.get('functionalCookiesEnabled')) {
    alert('Please accept functional cookies to use the like feature.');
    return;
  }

  const docId = getDocIdFromUrl(currentPhoto);
  const likedKey = `liked_${docId}`;
  const isCurrentlyLiked = localStorage.getItem(likedKey) === 'true';
  const increment = isCurrentlyLiked ? -1 : 1;
  const galleryId = store.get('currentGallery');

  // Emit event for firebase module to handle, including galleryId
  bus.emit('like:toggle', { url: currentPhoto, increment, galleryId });

  // Optimistic UI update
  if (isCurrentlyLiked) {
    localStorage.removeItem(likedKey);
  } else {
    localStorage.setItem(likedKey, 'true');
  }
  updateLikeButton(); // update heart immediately
};

// ==================== Event Listeners ====================

const setupEventListeners = () => {
  // Abort previous controller if any
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  // Modal close button — use history.back() to let popstate handle closing
  dom.modalClose?.addEventListener('click', () => history.back(), { signal });

  // Click on modal background — also use history.back()
  // But only if not zoomed (to avoid accidental close during pan)
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal && !isZoomed()) history.back();
  }, { signal });

  // Like button
  dom.likeBtn?.addEventListener('click', toggleLike, { signal });

  // Navigation buttons
  dom.modalPrev?.addEventListener('click', () => navigateModal('prev'), { signal });
  dom.modalNext?.addEventListener('click', () => navigateModal('next'), { signal });

  // Zoom buttons
  dom.zoomInBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    zoomIn();
  }, { signal });

  dom.zoomOutBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    zoomOut();
  }, { signal });

  // Keyboard navigation — context-aware (zoom vs navigate)
  document.addEventListener('keydown', (e) => {
    if (!store.get('isModalOpen')) return;

    if (e.key === 'Escape') {
      if (isZoomed()) {
        // First ESC: reset zoom
        resetZoom(true);
      } else {
        // Second ESC (or not zoomed): close modal
        history.back();
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      if (isZoomed()) {
        // Pan left when zoomed
        const panX = store.get('modalPanX') || 0;
        const panY = store.get('modalPanY') || 0;
        const clamped = clampPan(panX + 50, panY);
        store.set('modalPanX', clamped.panX);
        store.set('modalPanY', clamped.panY);
        applyTransform(true);
      } else {
        navigateModal('prev');
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      if (isZoomed()) {
        // Pan right when zoomed
        const panX = store.get('modalPanX') || 0;
        const panY = store.get('modalPanY') || 0;
        const clamped = clampPan(panX - 50, panY);
        store.set('modalPanX', clamped.panX);
        store.set('modalPanY', clamped.panY);
        applyTransform(true);
      } else {
        navigateModal('next');
      }
      return;
    }

    if (e.key === 'ArrowUp' && isZoomed()) {
      const panX = store.get('modalPanX') || 0;
      const panY = store.get('modalPanY') || 0;
      const clamped = clampPan(panX, panY + 50);
      store.set('modalPanX', clamped.panX);
      store.set('modalPanY', clamped.panY);
      applyTransform(true);
      return;
    }

    if (e.key === 'ArrowDown' && isZoomed()) {
      const panX = store.get('modalPanX') || 0;
      const panY = store.get('modalPanY') || 0;
      const clamped = clampPan(panX, panY - 50);
      store.set('modalPanX', clamped.panX);
      store.set('modalPanY', clamped.panY);
      applyTransform(true);
      return;
    }

    // + / = to zoom in, - to zoom out
    if (e.key === '+' || e.key === '=') {
      zoomIn();
      return;
    }
    if (e.key === '-') {
      zoomOut();
      return;
    }
  }, { signal });

  // ---- Zoom & Pan: Mouse events on the image container ----
  const container = dom.modalImgContainer;
  if (container) {
    // Mouse wheel zoom
    container.addEventListener('wheel', handleWheel, { passive: false, signal });

    // Mouse drag pan
    container.addEventListener('mousedown', handleMouseDown, { signal });

    // Double-click to toggle zoom
    container.addEventListener('click', handleDoubleClick, { signal });

    // Touch events for pinch zoom and pan
    container.addEventListener('touchstart', handleTouchStart, { passive: false, signal });
    container.addEventListener('touchmove', handleTouchMove, { passive: false, signal });
    container.addEventListener('touchend', handleTouchEnd, { signal });
  }

  // Mouse move and up need to be on document for drag continuity
  document.addEventListener('mousemove', handleMouseMove, { signal });
  document.addEventListener('mouseup', handleMouseUp, { signal });
};

// ==================== Event Subscriptions ====================

const subscribeToEvents = () => {
  // When photo selected from gallery
  bus.on('photo:select', openModal);

  // When likes are updated (from firebase)
  bus.on('like:updated', ({ url }) => {
    // Refresh button UI if this is the currently viewed photo
    if (store.get('currentPhoto') === url) {
      updateLikeButton();
    }
  });

  // Listen for modal close event from navigation (popstate)
  bus.on('modal:close', () => {
    closeModal();
  });
};

// ==================== Public API ====================

// Public init
export const initModal = () => {
  console.log('📲 Initializing modal module...');
  setupEventListeners();
  subscribeToEvents();
};

// Cleanup (if needed)
export const destroyModal = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
};
