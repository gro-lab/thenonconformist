// THE NONCONFORMIST - WITH DEEPSEEK-STYLE GALLERY NAVIGATION

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    increment,
    getDocs,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
    authDomain: "thenonconformistdotxyz.firebaseapp.com",
    projectId: "thenonconformistdotxyz",
    storageBucket: "thenonconformistdotxyz.firebasestorage.app",
    messagingSenderId: "552037212425",
    appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8",
    measurementId: "G-5MGS0G4CDY"
};

// GDPR: Default analytics disabled until explicit consent
window['ga-disable-G-5MGS0G4CDY'] = true;

// ⚠️ CRITICAL GDPR FIX: Firebase NOT initialized by default
// Only initialized after functional cookie consent
let app = null;
let db = null;
let analytics = null;

// Initialize Firebase only when user consents to functional cookies
const initFirebase = async () => {
    if (app) return; // Already initialized
    
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log('✅ Firebase initialized after consent');
};

// GALLERY CONFIG
const galleries = {
    'low': { 
        title: 'Language of Windows', 
        dir: 'LoW',
        subtitle: 'Exploring the silent stories behind glass',
        color: '#FF6B35'
    },
    'sol': { 
        title: 'Snapshots of Life', 
        dir: 'SoL',
        subtitle: 'Capturing the raw essence of everyday moments',
        color: '#9D4EDD'
    },
    'r': { 
        title: 'Reflections', 
        dir: 'R',
        subtitle: 'Where reality meets its mirror image',
        color: '#06FFA5'
    },
    'sa': { 
        title: 'Street Art', 
        dir: 'SA',
        subtitle: 'Urban expressions and vibrant creativity',
        color: '#FFD23F'
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let imageManifest = {};
let likesCache = {};
let currentModalImageUrl = null;
let currentModalImageIndex = -1;
let currentGalleryImages = []; // For modal navigation (in sorted order)
let isProcessing = false;
let currentGallery = 'low';
let galleryImageData = {}; // Simple storage: galleryKey -> array of image objects

// DeepSeek navigation state
let isDragging = false;
let startX = 0;
let startY = 0;
let scrollX = 0;
let scrollY = 0;
let maxScrollX = 0;
let maxScrollY = 0;

// GDPR: Functional cookies disabled by default until user explicitly accepts
window.FUNCTIONAL_COOKIES_ENABLED = false;

// ============================================
// UTILITIES
// ============================================

const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// GDPR: Clear functional cookie data when user rejects
const clearFunctionalCookieData = () => {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('liked_')) {
            localStorage.removeItem(key);
        }
    });
    console.log('🗑️ Cleared functional cookie data');
};

// ============================================
// PREVENT PULL-TO-REFRESH
// ============================================

const preventPullToRefresh = () => {
    // Prevent default touch behaviors that cause pull-to-refresh
    document.addEventListener('touchmove', function(e) {
        if (e.scale !== 1) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // Prevent overscroll behavior
    document.body.style.overscrollBehavior = 'none';
    
    // Disable elastic scrolling on iOS
    document.body.style.webkitOverflowScrolling = 'touch';
};

// ============================================
// CALCULATE SCROLL BOUNDARIES
// ============================================

const calculateScrollBoundaries = () => {
    const masonryGrid = document.getElementById('masonry-grid');
    const infiniteCanvas = document.getElementById('infinite-canvas');
    
    if (!masonryGrid || !infiniteCanvas) return;
    
    // Get the grid dimensions
    const gridRect = masonryGrid.getBoundingClientRect();
    const canvasRect = infiniteCanvas.getBoundingClientRect();
    
    // Calculate max scroll values - allow scrolling beyond boundaries
    maxScrollX = Math.max(0, gridRect.width - canvasRect.width + 200);
    maxScrollY = Math.max(0, gridRect.height - canvasRect.height + 200);
    
    console.log(`📏 Scroll boundaries: X=${maxScrollX}, Y=${maxScrollY}`);
    
    // Apply boundaries to current scroll position
    scrollX = Math.max(-maxScrollX, Math.min(maxScrollX, scrollX));
    scrollY = Math.max(-maxScrollY, Math.min(maxScrollY, scrollY));
    
    updateCanvasTransform();
};

// ============================================
// STABLE SORT BY LIKES - UPDATED FOR GRID ORDER
// ============================================

const stableSortByLikes = (items) => {
    return [...items].sort((a, b) => {
        if (b.likes !== a.likes) return b.likes - a.likes;
        return a.originalIndex - b.originalIndex;
    });
};

// ============================================
// MANIFEST LOADING
// ============================================

const loadManifest = async () => {
    try {
        const owner = 'gro-lab';
        const repo = 'thenonconformist';
        const branch = 'main';
        const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images.json`;
        
        console.log('📦 Loading manifest...');
        const response = await fetch(manifestUrl);
        
        if (!response.ok) {
            console.warn('⚠️ Manifest not found, using fallback');
            return generateFallbackManifest();
        }
        
        imageManifest = await response.json();
        console.log('✅ Manifest loaded:', imageManifest);
        return imageManifest;
    } catch (error) {
        console.warn('⚠️ Error loading manifest:', error);
        return generateFallbackManifest();
    }
};

const generateFallbackManifest = () => {
    const manifest = {};
    const defaultExtensions = {
        'LoW': 'JPEG',
        'SoL': 'JPEG',
        'R': 'JPEG',
        'SA': 'JPEG'
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
    
    imageManifest = manifest;
    console.log('📋 Using fallback manifest with default aspect ratios');
    return manifest;
};

// ============================================
// IMAGE URL CREATION
// ============================================

const createImageUrl = (dir, imageData) => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    
    const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}/${filename}`;
};

const getDocIdFromUrl = (url) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

// ============================================
// FIRESTORE FUNCTIONS
// ============================================

const fetchAllLikes = async () => {
    try {
        if (!window.FUNCTIONAL_COOKIES_ENABLED || !db) {
            console.log('⚠️ Functional cookies disabled - likes not loaded');
            return {};
        }
        
        const querySnapshot = await getDocs(collection(db, 'image_likes'));
        const likes = {};
        querySnapshot.forEach((doc) => {
            likes[doc.id] = doc.data().likes || 0;
        });
        likesCache = likes;
        console.log(`❤️ Loaded ${Object.keys(likes).length} like records`);
        return likes;
    } catch (error) {
        console.error('Error fetching likes:', error);
        return {};
    }
};

const updateLike = async (url, increment_value) => {
    try {
        if (!window.FUNCTIONAL_COOKIES_ENABLED || !db) {
            console.warn('⚠️ Functional cookies required for likes');
            return null;
        }
        
        const docId = getDocIdFromUrl(url);
        const docRef = doc(db, 'image_likes', docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            await updateDoc(docRef, {
                likes: increment(increment_value),
                lastUpdated: serverTimestamp()
            });
            const updatedSnap = await getDoc(docRef);
            const newLikes = updatedSnap.data().likes;
            likesCache[docId] = newLikes;
            return newLikes;
        } else {
            const initialLikes = Math.max(0, increment_value);
            await setDoc(docRef, {
                url: url,
                likes: initialLikes,
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });
            likesCache[docId] = initialLikes;
            return initialLikes;
        }
    } catch (error) {
        console.error('Error updating likes:', error);
        return null;
    }
};

// ============================================
// GALLERY DATA LOADING
// ============================================

const loadGalleryData = async (galleryKey) => {
    const gallery = galleries[galleryKey];
    const dir = gallery.dir;
    const imageList = imageManifest[dir] || [];
    
    if (imageList.length === 0) {
        console.warn(`⚠️ No images for ${gallery.title}`);
        return [];
    }
    
    console.log(`📸 Loading ${imageList.length} images for ${gallery.title}`);
    
    // Create image objects with originalIndex
    const images = imageList.map((imageData, originalIndex) => {
        const url = createImageUrl(dir, imageData);
        const docId = getDocIdFromUrl(url);
        const likes = likesCache[docId] || 0;
        
        return {
            url,
            likes,
            originalIndex,
            gallery: galleryKey,
            title: gallery.title,
            alt: `${gallery.title} - Image ${imageData.index}`,
            // Aspect ratio info for rendering
            aspectRatio: imageData.aspectDecimal || 
                        (imageData.width && imageData.height ? 
                         imageData.width / imageData.height : 
                         (imageData.orientation === 'vertical' ? 9/16 : 16/9)),
            imageData: imageData
        };
    });
    
    galleryImageData[galleryKey] = images;
    console.log(`✅ Gallery ${gallery.title} data loaded`);
    return images;
};

// ============================================
// GET MOST LIKED IMAGE FOR GALLERY COVER
// ============================================

const getMostLikedImageUrl = (galleryKey) => {
    const images = galleryImageData[galleryKey];
    if (!images || images.length === 0) return '';
    
    const sorted = stableSortByLikes(images);
    return sorted[0].url;
};

// ============================================
// GALLERY SELECTOR
// ============================================

const setupGallerySelector = async () => {
    // Load all gallery data
    await Promise.all(Object.keys(galleries).map(key => loadGalleryData(key)));
    
    // Update gallery covers with most liked images and counts
    Object.keys(galleries).forEach(key => {
        const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
        const countElement = document.getElementById(`${key}-count`);
        
        if (cover && galleryImageData[key]) {
            const mostLikedUrl = getMostLikedImageUrl(key);
            if (mostLikedUrl) {
                cover.style.backgroundImage = `url(${mostLikedUrl})`;
            }
        }
        
        if (countElement && galleryImageData[key]) {
            const count = galleryImageData[key].length;
            countElement.textContent = `${count} Works`;
        }
    });
    
    // Setup click handlers
    document.querySelectorAll('.gallery-cover').forEach(cover => {
        cover.addEventListener('click', function() {
            const galleryId = this.dataset.gallery;
            openGallery(galleryId);
        });
    });
};

const openGallery = (galleryId) => {
    currentGallery = galleryId;
    
    const gallerySelector = document.getElementById('gallery-selector');
    const loadingIndicator = document.getElementById('loading-indicator');
    const galleryContent = document.getElementById('gallery-content');
    const currentGalleryTitle = document.getElementById('current-gallery-title');
    const currentGallerySubtitle = document.getElementById('current-gallery-subtitle');
    
    // Show loading
    loadingIndicator.classList.add('active');
    
    // Hide selector
    gallerySelector.classList.add('hidden');
    
    // Update gallery header
    currentGalleryTitle.textContent = galleries[galleryId].title;
    currentGallerySubtitle.textContent = galleries[galleryId].subtitle;
    
    // Load gallery content after delay
    setTimeout(() => {
        loadGalleryContent(galleryId);
        loadingIndicator.classList.remove('active');
        galleryContent.classList.add('active');
        
        // Calculate scroll boundaries after content is loaded
        setTimeout(() => {
            calculateScrollBoundaries();
        }, 100);
    }, 800);
    
    // Prevent pull-to-refresh when gallery is active
    document.body.classList.add('gallery-active');
};

const loadGalleryContent = (galleryId) => {
    const masonryGrid = document.getElementById('masonry-grid');
    const gallery = galleries[galleryId];
    const images = galleryImageData[galleryId];
    
    // Clear existing content
    masonryGrid.innerHTML = '';
    
    // Sort images by likes (most liked first)
    const sortedImages = stableSortByLikes(images);
    currentGalleryImages = sortedImages;
    
    // Create masonry items in order (top-left to bottom-right by likes)
    sortedImages.forEach((image, index) => {
        const masonryItem = document.createElement('div');
        
        // Determine orientation based on aspect ratio
        let orientation = 'square';
        if (image.aspectRatio > 1.2) {
            orientation = 'horizontal';
        } else if (image.aspectRatio < 0.8) {
            orientation = 'vertical';
        }
        
        masonryItem.className = `masonry-item ${orientation}`;
        
        // Set staggered animation delay
        masonryItem.style.animationDelay = `${index * 0.03}s`;
        
        // Set background image WITHOUT gradient
        masonryItem.style.backgroundImage = `url(${image.url})`;
        
        // Create overlay content
        const overlay = document.createElement('div');
        overlay.className = 'item-overlay';
        
        overlay.innerHTML = `
            <div class="item-category">${gallery.title}</div>
            <div class="item-title">Image ${image.imageData.index}</div>
            <div class="item-likes">♥ ${image.likes}</div>
        `;
        
        // Click to open modal
        masonryItem.addEventListener('click', () => {
            openModal(image.url, gallery.title, galleryId, index);
        });
        
        masonryItem.appendChild(overlay);
        masonryGrid.appendChild(masonryItem);
    });
    
    // Reset scroll position
    scrollX = 0;
    scrollY = 0;
    updateCanvasTransform();
};

const closeGallery = () => {
    const galleryContent = document.getElementById('gallery-content');
    const gallerySelector = document.getElementById('gallery-selector');
    
    galleryContent.classList.remove('active');
    
    // Re-enable pull-to-refresh
    document.body.classList.remove('gallery-active');
    
    setTimeout(() => {
        gallerySelector.classList.remove('hidden');
        currentGallery = null;
    }, 800);
};

// ============================================
// DEEPSEEK-STYLE NAVIGATION
// ============================================

const updateCanvasTransform = () => {
    const canvas = document.getElementById('infinite-canvas');
    if (canvas) {
        canvas.style.transform = `translate(${scrollX}px, ${scrollY}px)`;
    }
};

const setupCanvasNavigation = () => {
    const canvas = document.getElementById('infinite-canvas');
    const galleryContent = document.getElementById('gallery-content');
    
    // Drag functionality
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('touchstart', startDragTouch, { passive: false });
    
    function startDrag(e) {
        if (!galleryContent.classList.contains('active')) return;
        isDragging = true;
        startX = e.clientX - scrollX;
        startY = e.clientY - scrollY;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    }
    
    function startDragTouch(e) {
        if (!galleryContent.classList.contains('active')) return;
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - scrollX;
            startY = e.touches[0].clientY - scrollY;
            e.preventDefault(); // Prevent pull-to-refresh
        }
    }
    
    function onDrag(e) {
        if (!isDragging || !galleryContent.classList.contains('active')) return;
        
        scrollX = e.clientX - startX;
        scrollY = e.clientY - startY;
        
        // Apply dynamic boundary limits
        scrollX = Math.max(-maxScrollX, Math.min(maxScrollX, scrollX));
        scrollY = Math.max(-maxScrollY, Math.min(maxScrollY, scrollY));
        
        updateCanvasTransform();
    }
    
    function onDragTouch(e) {
        if (!isDragging || !galleryContent.classList.contains('active')) return;
        if (e.touches.length === 1) {
            scrollX = e.touches[0].clientX - startX;
            scrollY = e.touches[0].clientY - startY;
            
            // Apply dynamic boundary limits
            scrollX = Math.max(-maxScrollX, Math.min(maxScrollX, scrollX));
            scrollY = Math.max(-maxScrollY, Math.min(maxScrollY, scrollY));
            
            updateCanvasTransform();
            e.preventDefault(); // Prevent pull-to-refresh
        }
    }
    
    function stopDrag() {
        isDragging = false;
        canvas.style.cursor = '';
    }
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDragTouch, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (!galleryContent.classList.contains('active')) return;
        
        const scrollSpeed = 30;
        
        switch(e.key) {
            case 'ArrowLeft':
                scrollX += scrollSpeed;
                break;
            case 'ArrowRight':
                scrollX -= scrollSpeed;
                break;
            case 'ArrowUp':
                scrollY += scrollSpeed;
                break;
            case 'ArrowDown':
                scrollY -= scrollSpeed;
                break;
            case 'Escape':
                closeGallery();
                return;
        }
        
        // Apply dynamic boundary limits
        scrollX = Math.max(-maxScrollX, Math.min(maxScrollX, scrollX));
        scrollY = Math.max(-maxScrollY, Math.min(maxScrollY, scrollY));
        
        updateCanvasTransform();
    });
    
    // Mouse wheel navigation
    canvas.addEventListener('wheel', function(e) {
        if (!galleryContent.classList.contains('active')) return;
        
        e.preventDefault();
        
        scrollX -= e.deltaX * 0.5;
        scrollY -= e.deltaY * 0.5;
        
        // Apply dynamic boundary limits
        scrollX = Math.max(-maxScrollX, Math.min(maxScrollX, scrollX));
        scrollY = Math.max(-maxScrollY, Math.min(maxScrollY, scrollY));
        
        updateCanvasTransform();
    }, { passive: false });
    
    // Handle window resize
    window.addEventListener('resize', debounce(() => {
        if (galleryContent.classList.contains('active')) {
            calculateScrollBoundaries();
        }
    }, 250));
};

// ============================================
// BACK BUTTON
// ============================================

const setupBackButton = () => {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', closeGallery);
    }
};

// ============================================
// MODAL FUNCTIONS
// ============================================

const modal = document.getElementById('modal');
const modalImage = document.getElementById('modal-img');
const likeBtn = document.getElementById('like-btn');
const modalClose = document.getElementById('modal-close');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');

const openModal = (imageUrl, category = 'Image', galleryKey = currentGallery, imageIndex = 0) => {
    currentModalImageUrl = imageUrl;
    currentModalImageIndex = imageIndex;
    modalImage.src = imageUrl;
    
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    updateLikeButton();
    updateNavButtons();
};

const closeModal = () => {
    modal.setAttribute('hidden', '');
    currentModalImageUrl = null;
    currentModalImageIndex = -1;
    document.body.style.overflow = 'auto';
};

const navigateModal = (direction) => {
    if (currentGalleryImages.length === 0) return;
    
    if (direction === 'prev') {
        currentModalImageIndex = (currentModalImageIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    } else {
        currentModalImageIndex = (currentModalImageIndex + 1) % currentGalleryImages.length;
    }
    
    const nextImage = currentGalleryImages[currentModalImageIndex];
    currentModalImageUrl = nextImage.url;
    modalImage.src = nextImage.url;
    
    updateLikeButton();
    updateNavButtons();
};

const updateNavButtons = () => {
    if (currentGalleryImages.length <= 1) {
        modalPrev.style.display = 'none';
        modalNext.style.display = 'none';
    } else {
        modalPrev.style.display = 'flex';
        modalNext.style.display = 'flex';
    }
};

const updateLikeButton = () => {
    if (!currentModalImageUrl) return;
    
    const docId = getDocIdFromUrl(currentModalImageUrl);
    const likes = likesCache[docId] || 0;
    const likeCount = document.getElementById('like-count');
    const heart = likeBtn.querySelector('.heart');
    
    if (likeCount) likeCount.textContent = likes;
    
    let isLiked = false;
    if (window.FUNCTIONAL_COOKIES_ENABLED) {
        const likedKey = `liked_${docId}`;
        isLiked = localStorage.getItem(likedKey) === 'true';
    }
    
    if (heart) {
        heart.textContent = isLiked ? '♥' : '♡';
        if (isLiked) {
            likeBtn.classList.add('liked');
        } else {
            likeBtn.classList.remove('liked');
        }
    }
};

// ============================================
// LIKE HANDLING
// ============================================

const toggleLike = async () => {
    if (!currentModalImageUrl || isProcessing) return;
    
    if (!window.FUNCTIONAL_COOKIES_ENABLED) {
        alert('Please accept functional cookies to use the like feature.');
        return;
    }
    
    isProcessing = true;
    likeBtn.disabled = true;
    
    const docId = getDocIdFromUrl(currentModalImageUrl);
    const likedKey = `liked_${docId}`;
    const isCurrentlyLiked = localStorage.getItem(likedKey) === 'true';
    
    try {
        const increment_value = isCurrentlyLiked ? -1 : 1;
        const newLikes = await updateLike(currentModalImageUrl, increment_value);
        
        if (newLikes !== null) {
            // Update localStorage
            if (isCurrentlyLiked) {
                localStorage.removeItem(likedKey);
            } else {
                localStorage.setItem(likedKey, 'true');
            }
            
            // Update cache
            likesCache[docId] = newLikes;
            
            // Update image data in ALL galleries
            Object.keys(galleryImageData).forEach(galleryKey => {
                const images = galleryImageData[galleryKey];
                const imageIndex = images.findIndex(img => img.url === currentModalImageUrl);
                if (imageIndex !== -1) {
                    images[imageIndex].likes = newLikes;
                }
            });
            
            // Update modal UI
            updateLikeButton();
            
            // Re-render current gallery (will re-sort automatically)
            loadGalleryContent(currentGallery);
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        alert('Failed to update like. Please try again.');
    } finally {
        isProcessing = false;
        likeBtn.disabled = false;
    }
};

// ============================================
// MODAL EVENT LISTENERS
// ============================================

if (modalClose) modalClose.addEventListener('click', closeModal);

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

if (likeBtn) likeBtn.addEventListener('click', toggleLike);

if (modalPrev) modalPrev.addEventListener('click', () => navigateModal('prev'));
if (modalNext) modalNext.addEventListener('click', () => navigateModal('next'));

// Keyboard
document.addEventListener('keydown', (e) => {
    if (!modal.hasAttribute('hidden')) {
        if (e.key === 'Escape') {
            closeModal();
        } else if (e.key === 'ArrowLeft') {
            navigateModal('prev');
        } else if (e.key === 'ArrowRight') {
            navigateModal('next');
        }
    }
});

// ============================================
// GDPR COOKIE CONSENT FUNCTIONS
// ============================================

const initCookieBanner = () => {
    const savedPrefs = localStorage.getItem('cookiePreferences');
    
    if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        console.log('📋 Applying cookie preferences:', prefs);
        applyCookiePreferences(prefs);
    } else {
        showCookieBanner();
    }
};

const showCookieBanner = () => {
    const banner = document.getElementById('cookie-banner');
    if (banner) {
        banner.removeAttribute('hidden');
    }
};

const applyCookiePreferences = async (prefs) => {
    console.log('🔧 Applying cookie preferences:', prefs);
    
    // Functional cookies (Firebase, likes, etc.)
    if (prefs.functional) {
        window.FUNCTIONAL_COOKIES_ENABLED = true;
        await initFirebase();
        await fetchAllLikes();
        console.log('✅ Functional cookies enabled');
    } else {
        console.log('❌ Functional cookies disabled');
    }
    
    // Analytics cookies
    if (prefs.analytics) {
        window['ga-disable-G-5MGS0G4CDY'] = false;
        import('https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js')
            .then(({ getAnalytics }) => {
                if (app) {
                    analytics = getAnalytics(app);
                    console.log('✅ Analytics enabled after consent');
                }
            });
    } else {
        console.log('❌ Analytics cookies disabled');
    }
    
    // Marketing cookies
    if (prefs.marketing) {
        console.log('✅ Marketing cookies enabled');
    } else {
        console.log('❌ Marketing cookies disabled');
    }
};

// ============================================
// COOKIE EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookie-banner');
    const cookieSettingsModal = document.getElementById('cookie-settings-modal');
    
    // Banner buttons
    const cookieAcceptBtn = document.getElementById('cookie-accept-btn');
    const cookieRejectBtn = document.getElementById('cookie-reject-btn');
    const cookieSettingsBtn = document.getElementById('cookie-settings-btn');
    
    // Modal buttons
    const cookieSaveBtn = document.getElementById('cookie-save-btn');
    const cookieAcceptAllBtn = document.getElementById('cookie-accept-all-btn');
    const cookieRejectAllBtn = document.getElementById('cookie-reject-all-btn');
    const cookieSettingsModalClose = cookieSettingsModal?.querySelector('.modal-close');
    
    // Floating button
    const cookieFloatBtn = document.getElementById('cookie-float-btn');
    
    // Accept All from banner
    if (cookieAcceptBtn) {
        cookieAcceptBtn.addEventListener('click', async () => {
            const prefs = {
                essential: true,
                analytics: true,
                functional: true,
                marketing: true,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            console.log('✅ Accepting all cookies from banner:', prefs);
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            if (cookieBanner) cookieBanner.setAttribute('hidden', '');
            await applyCookiePreferences(prefs);
            location.reload();
        });
    }
    
    // Reject All from banner
    if (cookieRejectBtn) {
        cookieRejectBtn.addEventListener('click', () => {
            const prefs = {
                essential: true,
                analytics: false,
                functional: false,
                marketing: false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            
            clearFunctionalCookieData();
            
            if (cookieBanner) cookieBanner.setAttribute('hidden', '');
            console.log('✅ Essential cookies only');
            location.reload();
        });
    }
    
    // Open settings modal from banner
    if (cookieSettingsBtn && cookieSettingsModal) {
        cookieSettingsBtn.addEventListener('click', () => {
            if (cookieBanner) cookieBanner.setAttribute('hidden', '');
            loadCookiePreferencesIntoModal();
            cookieSettingsModal.removeAttribute('hidden');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Open settings modal from floating button
    if (cookieFloatBtn && cookieSettingsModal) {
        cookieFloatBtn.addEventListener('click', () => {
            loadCookiePreferencesIntoModal();
            cookieSettingsModal.removeAttribute('hidden');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Helper function to load saved preferences into checkboxes
    function loadCookiePreferencesIntoModal() {
        const savedPrefs = localStorage.getItem('cookiePreferences');
        if (savedPrefs) {
            const prefs = JSON.parse(savedPrefs);
            
            const analyticsCheckbox = document.getElementById('analytics-cookies');
            const functionalCheckbox = document.getElementById('functional-cookies');
            const marketingCheckbox = document.getElementById('marketing-cookies');
            
            if (analyticsCheckbox) analyticsCheckbox.checked = prefs.analytics || false;
            if (functionalCheckbox) functionalCheckbox.checked = prefs.functional || false;
            if (marketingCheckbox) marketingCheckbox.checked = prefs.marketing || false;
        }
    }
    
    // Close settings modal
    if (cookieSettingsModalClose && cookieSettingsModal) {
        cookieSettingsModalClose.addEventListener('click', () => {
            cookieSettingsModal.setAttribute('hidden', '');
            document.body.style.overflow = 'auto';
        });
    }
    
    // Click outside to close settings modal
    if (cookieSettingsModal) {
        cookieSettingsModal.addEventListener('click', (e) => {
            if (e.target === cookieSettingsModal) {
                cookieSettingsModal.setAttribute('hidden', '');
                document.body.style.overflow = 'auto';
            }
        });
    }
    
    // Save custom preferences
    if (cookieSaveBtn && cookieSettingsModal) {
        cookieSaveBtn.addEventListener('click', async () => {
            const analyticsCheckbox = document.getElementById('analytics-cookies');
            const functionalCheckbox = document.getElementById('functional-cookies');
            const marketingCheckbox = document.getElementById('marketing-cookies');
            
            const prefs = {
                essential: true,
                analytics: analyticsCheckbox?.checked || false,
                functional: functionalCheckbox?.checked || false,
                marketing: marketingCheckbox?.checked || false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            
            console.log('💾 Saving cookie preferences:', prefs);
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            
            if (!prefs.functional) {
                clearFunctionalCookieData();
            }
            
            cookieSettingsModal.setAttribute('hidden', '');
            document.body.style.overflow = 'auto';
            await applyCookiePreferences(prefs);
            location.reload();
        });
    }
    
    // Accept all from settings modal
    if (cookieAcceptAllBtn && cookieSettingsModal) {
        cookieAcceptAllBtn.addEventListener('click', async () => {
            const analyticsCheckbox = document.getElementById('analytics-cookies');
            const functionalCheckbox = document.getElementById('functional-cookies');
            const marketingCheckbox = document.getElementById('marketing-cookies');
            
            if (analyticsCheckbox) analyticsCheckbox.checked = true;
            if (functionalCheckbox) functionalCheckbox.checked = true;
            if (marketingCheckbox) marketingCheckbox.checked = true;
            
            const prefs = {
                essential: true,
                analytics: true,
                functional: true,
                marketing: true,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            console.log('✅ Accepting all cookies from modal:', prefs);
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            cookieSettingsModal.setAttribute('hidden', '');
            document.body.style.overflow = 'auto';
            await applyCookiePreferences(prefs);
            location.reload();
        });
    }
    
    // Reject all from settings modal
    if (cookieRejectAllBtn && cookieSettingsModal) {
        cookieRejectAllBtn.addEventListener('click', () => {
            const analyticsCheckbox = document.getElementById('analytics-cookies');
            const functionalCheckbox = document.getElementById('functional-cookies');
            const marketingCheckbox = document.getElementById('marketing-cookies');
            
            if (analyticsCheckbox) analyticsCheckbox.checked = false;
            if (functionalCheckbox) functionalCheckbox.checked = false;
            if (marketingCheckbox) marketingCheckbox.checked = false;
            
            const prefs = {
                essential: true,
                analytics: false,
                functional: false,
                marketing: false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            console.log('🚫 Rejecting all optional cookies:', prefs);
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            
            clearFunctionalCookieData();
            
            cookieSettingsModal.setAttribute('hidden', '');
            document.body.style.overflow = 'auto';
            location.reload();
        });
    }
});

// ============================================
// INITIALIZATION
// ============================================

const init = async () => {
    try {
        console.log('🚀 Initializing The Nonconformist...');
        
        // Initialize cookie banner first
        initCookieBanner();
        
        // Prevent pull-to-refresh
        preventPullToRefresh();
        
        // Load manifest
        await loadManifest();
        
        // Setup gallery selector (loads all galleries)
        await setupGallerySelector();
        
        // Setup DeepSeek navigation
        setupCanvasNavigation();
        setupBackButton();
        
        console.log('✅ Initialization complete');
    } catch (error) {
        console.error('❌ Init error:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Service Worker for image caching
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registered for image caching');
            })
            .catch(error => {
                console.warn('Service Worker registration failed:', error);
            });
    });
}
