// js/modules/navigation.js
// Navigation module: history API, back button, canvas panning, swipe, keyboard
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';
import { errorHandler } from '../lib/error-handler.js';
import { debounce, TRANSITION_MS } from '../lib/utils.js';

let abortController = null;
let isPopstateHandling = false; // to avoid recursion

// Gallery name mapping for back button label
const galleryNames = {
  low: 'Language of Windows',
  sol: 'Snapshots of Life',
  r: 'Reflections',
  sa: 'Street Art'
};

// Push a "trap" state on the homepage so browser back cannot leave the site
const pushHomepageTrap = () => {
  history.replaceState({ page: 'home' }, '', window.location.href);
  history.pushState({ page: 'home-trap' }, '', window.location.href);
};

// Calculate scroll limits based on grid size
const calculateScrollLimits = () => {
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

  const canvasStyle = window.getComputedStyle(canvas);
  const paddingLeft = parseInt(canvasStyle.paddingLeft) || 20;
  const paddingRight = parseInt(canvasStyle.paddingRight) || 20;
  const paddingTop = parseInt(canvasStyle.paddingTop) || 120;
  const paddingBottom = parseInt(canvasStyle.paddingBottom) || 80;

  const scrollableWidth = Math.max(0, contentWidth - viewportWidth + paddingLeft + paddingRight);
  const scrollableHeight = Math.max(0, contentHeight - viewportHeight + paddingTop + paddingBottom);

  store.set('scrollLimits', {
    minX: -scrollableWidth,
    maxX: scrollableWidth,
    minY: -scrollableHeight,
    maxY: scrollableHeight
  });
};

const debouncedCalculateScrollLimits = debounce(calculateScrollLimits, 150);

// Update canvas transform based on store scroll values
const updateCanvasTransform = () => {
  const container = dom.canvasTransformContainer;
  if (!container) return;
  const { scrollX, scrollY } = store.snapshot();
  container.style.transform = `translate(${scrollX}px, ${scrollY}px)`;
};

// ==================== Drag & Pan ====================
let dragStartX = 0, dragStartY = 0;

const startDrag = (e) => {
  if (!store.get('isGalleryOpen')) return;
  store.set('isDragging', true);
  dragStartX = e.clientX - store.get('scrollX');
  dragStartY = e.clientY - store.get('scrollY');
  dom.infiniteCanvas.style.cursor = 'grabbing';
  e.preventDefault();
};

const startDragTouch = (e) => {
  if (!store.get('isGalleryOpen')) return;
  if (e.touches.length === 1) {
    store.set('isDragging', true);
    dragStartX = e.touches[0].clientX - store.get('scrollX');
    dragStartY = e.touches[0].clientY - store.get('scrollY');
  }
};

const onDrag = (e) => {
  if (!store.get('isDragging') || !store.get('isGalleryOpen')) return;

  let newX = e.clientX - dragStartX;
  let newY = e.clientY - dragStartY;

  const limits = store.get('scrollLimits');
  newX = Math.max(limits.minX, Math.min(limits.maxX, newX));
  newY = Math.max(limits.minY, Math.min(limits.maxY, newY));

  store.set('scrollX', newX);
  store.set('scrollY', newY);
  updateCanvasTransform();
};

const onDragTouch = (e) => {
  if (!store.get('isDragging') || !store.get('isGalleryOpen')) return;
  if (e.touches.length === 1) {
    let newX = e.touches[0].clientX - dragStartX;
    let newY = e.touches[0].clientY - dragStartY;

    const limits = store.get('scrollLimits');
    newX = Math.max(limits.minX, Math.min(limits.maxX, newX));
    newY = Math.max(limits.minY, Math.min(limits.maxY, newY));

    store.set('scrollX', newX);
    store.set('scrollY', newY);
    updateCanvasTransform();
  }
};

const stopDrag = () => {
  store.set('isDragging', false);
  if (dom.infiniteCanvas) dom.infiniteCanvas.style.cursor = '';
};

// ==================== Keyboard Navigation ====================
const handleKeyDown = (e) => {
  if (!store.get('isGalleryOpen') || store.get('isModalOpen')) return;

  const scrollSpeed = 30;
  let { scrollX, scrollY } = store.snapshot();
  const limits = store.get('scrollLimits');

  switch (e.key) {
    case 'ArrowLeft': scrollX += scrollSpeed; break;
    case 'ArrowRight': scrollX -= scrollSpeed; break;
    case 'ArrowUp': scrollY += scrollSpeed; break;
    case 'ArrowDown': scrollY -= scrollSpeed; break;
    case 'Escape':
      closeGallery();
      return;
    default: return;
  }

  scrollX = Math.max(limits.minX, Math.min(limits.maxX, scrollX));
  scrollY = Math.max(limits.minY, Math.min(limits.maxY, scrollY));

  store.set('scrollX', scrollX);
  store.set('scrollY', scrollY);
  updateCanvasTransform();
};

// ==================== Gallery Open/Close ====================
const openGallery = (galleryId) => {
  // Capture current scroll position BEFORE any DOM changes
  const currentScrollY = window.scrollY;
  console.log('📌 Storing homepage scrollY:', currentScrollY);
  store.set('homepageScrollY', currentScrollY);
  
  store.set('currentGallery', galleryId);
  store.set('isGalleryOpen', true);

  // Update back button label to reflect the current gallery
  if (dom.backButton) {
    const galleryName = galleryNames[galleryId] || 'Galleries';
    dom.backButton.innerHTML = `<span>←</span> ${galleryName}`;
  }

  // Push history state
  history.pushState({ page: 'gallery', gallery: galleryId }, '', window.location.href);
};

const closeGallery = () => {
  if (!store.get('isGalleryOpen')) return;
  if (isPopstateHandling) {
    performCloseGallery();
    return;
  }
  history.back();
};

const performCloseGallery = () => {	
	
	  bus.emit('gallery:close');
	
	  // Instantly hide gallery (no fade-out)
	  if (dom.galleryContent) {
	    dom.galleryContent.style.transition = 'none';
	    dom.galleryContent.classList.remove('active');
	  }
	
	  // Show homepage elements immediately
	  dom.gallerySelector?.classList.remove('hidden');
	  document.querySelector('.site-intro')?.classList.remove('hidden');
	  document.querySelector('.terms-footer')?.classList.remove('hidden');
	  store.set('isGalleryOpen', false);
	
	
	  const savedScrollY = store.get('homepageScrollY');
	  console.log('📌 Restoring homepage scrollY:', savedScrollY);
	
	
	
	
	
	  requestAnimationFrame(() => {
	    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
	    // Restore transition for the next gallery open (fade-in still works)
	    if (dom.galleryContent) {
	      dom.galleryContent.style.transition = '';
	    }
	  });
	
	  if (dom.loadingIndicator) dom.loadingIndicator.classList.remove('active');
	  pushHomepageTrap();
	};


// ==================== Terms Modal ====================
const openTermsModal = () => {
  history.pushState({ page: 'terms' }, '', window.location.href);
  store.set('isTermsModalOpen', true);
  dom.termsModal?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
};

const closeTermsModal = () => {
  if (!store.get('isTermsModalOpen')) return;
  if (isPopstateHandling) {
    performCloseTermsModal();
    return;
  }
  history.back();
};

const performCloseTermsModal = () => {
  dom.termsModal?.setAttribute('hidden', '');
  document.body.style.overflow = 'auto';
  store.set('isTermsModalOpen', false);
  pushHomepageTrap(); // re-trap
};

// ==================== History API ====================
const handlePopState = (e) => {
  if (isPopstateHandling) return;
  isPopstateHandling = true;

  const state = e.state || {};

  // If picture modal is open, close it
  if (store.get('isModalOpen')) {
    bus.emit('modal:close'); // let modal module handle it
    isPopstateHandling = false;
    return;
  }

  // If terms modal is open, close it
  if (store.get('isTermsModalOpen')) {
    performCloseTermsModal();
    isPopstateHandling = false;
    return;
  }

  // If cookie modal is open, close it
  if (store.get('isCookieModalOpen')) {
    import('./cookies.js').then(module => {
      module.closeCookieModal?.();
    }).catch(err => {
      console.error('Failed to load cookies module:', err);
    });
    isPopstateHandling = false;
    return;
  }

  // If gallery is open, close it
  if (store.get('isGalleryOpen')) {
    performCloseGallery();
    isPopstateHandling = false;
    return;
  }

  // On homepage, re-push trap
  pushHomepageTrap();
  isPopstateHandling = false;
};

// ==================== Setup ====================
const setupCanvasNavigation = () => {
  const canvas = dom.infiniteCanvas;
  if (!canvas) return;

  canvas.addEventListener('mousedown', startDrag, { signal: abortController.signal });
  canvas.addEventListener('touchstart', startDragTouch, { passive: false, signal: abortController.signal });
  document.addEventListener('mousemove', onDrag, { signal: abortController.signal });
  document.addEventListener('touchmove', onDragTouch, { passive: false, signal: abortController.signal });
  document.addEventListener('mouseup', stopDrag, { signal: abortController.signal });
  document.addEventListener('touchend', stopDrag, { signal: abortController.signal });

  // Wheel navigation
  canvas.addEventListener('wheel', (e) => {
    if (!store.get('isGalleryOpen')) return;
    e.preventDefault();
    let { scrollX, scrollY } = store.snapshot();
    scrollX -= e.deltaX * 0.5;
    scrollY -= e.deltaY * 0.5;
    const limits = store.get('scrollLimits');
    scrollX = Math.max(limits.minX, Math.min(limits.maxX, scrollX));
    scrollY = Math.max(limits.minY, Math.min(limits.maxY, scrollY));
    store.set('scrollX', scrollX);
    store.set('scrollY', scrollY);
    updateCanvasTransform();
  }, { passive: false, signal: abortController.signal });

  // Recalculate limits on resize (debounced)
  window.addEventListener('resize', () => {
    if (store.get('isGalleryOpen')) {
      debouncedCalculateScrollLimits();
    }
  }, { signal: abortController.signal });

  // When gallery content loaded, recalc limits
  bus.on('gallery:contentLoaded', () => {
    setTimeout(() => {
      calculateScrollLimits();
      updateCanvasTransform();
    }, 100);
    setTimeout(calculateScrollLimits, 500);
  });
};

const setupBackButton = () => {
  dom.backButton?.addEventListener('click', closeGallery, { signal: abortController.signal });
};

const setupTermsLink = () => {
  dom.termsLink?.addEventListener('click', openTermsModal, { signal: abortController.signal });
  dom.termsModalClose?.addEventListener('click', closeTermsModal, { signal: abortController.signal });
  dom.termsModal?.addEventListener('click', (e) => {
    if (e.target === dom.termsModal) closeTermsModal();
  }, { signal: abortController.signal });
};

// Subscribe to events from other modules
const subscribeToEvents = () => {
  // When gallery requests open (from gallery module)
  bus.on('gallery:open', (galleryId) => {
    openGallery(galleryId);
  });

  // When terms modal requested (e.g. from cookie banner privacy link)
  bus.on('terms:open', () => {
    openTermsModal();
  });
};

// Public init
export const initNavigation = () => {
  console.log('🧭 Initializing navigation module...');
  
  // Disable automatic browser scroll restoration
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  
  abortController = new AbortController();

  pushHomepageTrap();
  window.addEventListener('popstate', handlePopState, { signal: abortController.signal });

  setupCanvasNavigation();
  setupBackButton();
  setupTermsLink();
  subscribeToEvents();

  // Also update transform when scroll values change
  store.subscribe('scrollX', updateCanvasTransform);
  store.subscribe('scrollY', updateCanvasTransform);
};

// Cleanup
export const destroyNavigation = () => {
  abortController?.abort();
  abortController = null;
};
