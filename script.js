// THE NONCONFORMIST - UPDATED VERSION WITH FIXED COLUMN SORTING

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

// FIREBASE CONFIG (same as before)
const firebaseConfig = {
    apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
    authDomain: "thenonconformistdotxyz.firebaseapp.com",
    projectId: "thenonconformistdotxyz",
    storageBucket: "thenonconformistdotxyz.firebasestorage.app",
    messagingSenderId: "552037212425",
    appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8",
    measurementId: "G-5MGS0G4CDY"
};

window['ga-disable-G-5MGS0G4CDY'] = true;
let app = null;
let db = null;
let analytics = null;

// GALLERY CONFIG
const galleries = {
    'low': { title: 'Language of Windows', dir: 'LoW' },
    'sol': { title: 'Snapshots of Life', dir: 'SoL' },
    'r': { title: 'Reflections', dir: 'R' },
    'sa': { title: 'Street Art', dir: 'SA' }
};

// STATE - ADDED RAW DATA STORAGE
let imageManifest = {};
let likesCache = {};
let currentModalImageUrl = null;
let currentModalImageIndex = -1;
let currentGalleryImages = [];
let isProcessing = false;
let currentGallery = 'low';
let galleryRawData = {};     // Raw image data (canonical order)
let galleryVisualOrder = {}; // Transposed order for rendering
let currentColumnCount = 5;  // Default, will be updated

// GDPR: Functional cookies disabled by default
window.FUNCTIONAL_COOKIES_ENABLED = false;

// ============================================
// NEW: COLUMN MANAGEMENT FUNCTIONS
// ============================================

/**
 * Get current column count from CSS
 * This respects your media queries in styles.css
 */
const getColumnCount = () => {
    const grid = document.getElementById('masonry-grid');
    if (!grid) return 5;
    
    const styles = getComputedStyle(grid);
    const columnCount = styles.columnCount;
    
    // Parse the column-count value
    if (columnCount === 'auto') {
        // Fallback: check container width for responsive
        const containerWidth = grid.clientWidth;
        if (containerWidth >= 1400) return 5;
        if (containerWidth >= 1024) return 4;
        if (containerWidth >= 768) return 3;
        if (containerWidth >= 480) return 2;
        return 2; // mobile
    }
    
    return parseInt(columnCount, 10) || 5;
};

/**
 * Stable sort by likes, then by original index
 */
const stableSortByLikes = (images) => {
    return [...images].sort((a, b) => {
        if (b.likes !== a.likes) return b.likes - a.likes;
        return a.originalIndex - b.originalIndex;
    });
};

/**
 * Transpose row-order array to column-order for CSS columns
 * This is the KEY function that fixes the jumbled layout
 */
const transposeForColumns = (rowSortedImages, columnCount) => {
    if (columnCount <= 1) return rowSortedImages;
    
    const rows = Math.ceil(rowSortedImages.length / columnCount);
    const result = [];
    
    // Fill by columns (what CSS columns expect)
    for (let col = 0; col < columnCount; col++) {
        for (let row = 0; row < rows; row++) {
            const index = row * columnCount + col;
            if (index < rowSortedImages.length) {
                result.push(rowSortedImages[index]);
            }
        }
    }
    
    return result;
};

/**
 * Update visual order for current column count
 */
const updateVisualOrder = (galleryKey) => {
    const rawImages = galleryRawData[galleryKey];
    if (!rawImages) return [];
    
    const columnCount = getColumnCount();
    currentColumnCount = columnCount;
    
    // 1. Sort in row order (human expectation)
    const rowSorted = stableSortByLikes(rawImages);
    
    // 2. Transpose to column order (CSS expectation)
    const columnOrdered = transposeForColumns(rowSorted, columnCount);
    
    galleryVisualOrder[galleryKey] = columnOrdered;
    return columnOrdered;
};

// ============================================
// EXISTING FUNCTIONS (with updates)
// ============================================

const initFirebase = async () => {
    if (app) return;
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
};

const clearFunctionalCookieData = () => {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('liked_')) {
            localStorage.removeItem(key);
        }
    });
};

const loadManifest = async () => {
    try {
        const owner = 'gro-lab';
        const repo = 'thenonconformist';
        const branch = 'main';
        const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images.json`;
        
        const response = await fetch(manifestUrl);
        
        if (!response.ok) {
            console.warn('⚠️ Manifest not found, using fallback');
            return generateFallbackManifest();
        }
        
        imageManifest = await response.json();
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
    return manifest;
};

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

const setupLazyLoading = (img) => {
    const options = {
        rootMargin: '400px',
        threshold: 0.01
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const image = entry.target;
                const src = image.dataset.src;
                
                if (src && !image.classList.contains('loaded')) {
                    const preloader = new Image();
                    preloader.onload = () => {
                        image.src = src;
                        image.classList.add('loaded');
                        image.style.opacity = '1';
                    };
                    preloader.onerror = () => {
                        console.warn(`Failed to load: ${src}`);
                        image.remove();
                    };
                    preloader.src = src;
                }
                
                observer.unobserve(image);
            }
        });
    }, options);
    
    observer.observe(img);
};

// UPDATED: Store raw data with originalIndex
const generateImageGrid = async (galleryKey) => {
    if (galleryRawData[galleryKey]) {
        return galleryRawData[galleryKey];
    }
    
    const gallery = galleries[galleryKey];
    const dir = gallery.dir;
    const imageList = imageManifest[dir] || [];
    
    if (imageList.length === 0) {
        return [];
    }
    
    const rawImages = imageList.map((imageData, originalIndex) => {
        const url = createImageUrl(dir, imageData);
        const docId = getDocIdFromUrl(url);
        const likes = likesCache[docId] || 0;
        
        const card = document.createElement('div');
        card.className = 'image-card';
        card.dataset.gallery = galleryKey;
        card.dataset.url = url;
        card.dataset.category = gallery.title;
        
        const img = document.createElement('img');
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.dataset.src = url;
        img.alt = `${gallery.title} - Image ${imageData.index}`;
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';
        
        if (imageData.aspectDecimal && imageData.aspectDecimal > 0) {
            img.style.aspectRatio = imageData.aspectDecimal;
        } else if (imageData.width && imageData.height) {
            img.style.aspectRatio = imageData.width / imageData.height;
        } else if (imageData.orientation === 'horizontal') {
            img.style.aspectRatio = 16 / 9;
        } else if (imageData.orientation === 'vertical') {
            img.style.aspectRatio = 9 / 16;
        }
        
        img.style.width = '100%';
        img.style.height = 'auto';
        
        const likeCount = document.createElement('div');
        likeCount.className = 'card-like-count';
        likeCount.innerHTML = `<i class="fas fa-heart"></i> <span>${likes}</span>`;
        
        card.appendChild(img);
        card.appendChild(likeCount);
        
        card.addEventListener('click', () => openModal(url, gallery.title, galleryKey));
        
        setupLazyLoading(img);
        
        return {
            element: card,
            url: url,
            likes: likes,
            originalIndex: originalIndex, // Critical for stable sorting
            gallery: galleryKey,
            category: gallery.title
        };
    });
    
    // Store raw data (not sorted yet)
    galleryRawData[galleryKey] = rawImages;
    return rawImages;
};

// UPDATED: Use visual order for rendering
const renderMasonryGrid = async (galleryKey) => {
    const grid = document.getElementById('masonry-grid');
    if (!grid) return;
    
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    
    // Clear grid
    grid.innerHTML = '';
    
    // Get or generate raw data
    await generateImageGrid(galleryKey);
    
    // Update visual order based on current column count
    const visualImages = updateVisualOrder(galleryKey);
    galleryVisualOrder[galleryKey] = visualImages;
    
    // Append in visual (column) order
    visualImages.forEach(({ element }) => {
        grid.appendChild(element);
    });
    
    if (loadingIndicator) {
        setTimeout(() => {
            loadingIndicator.classList.add('hidden');
        }, 300);
    }
};

// UPDATED: When likes change, update raw data and re-render
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
            updateLikeButton();
            
            // CRITICAL: Update raw data, not visual order
            Object.keys(galleryRawData).forEach(galleryKey => {
                const rawImages = galleryRawData[galleryKey];
                const imageIndex = rawImages.findIndex(img => img.url === currentModalImageUrl);
                if (imageIndex !== -1) {
                    rawImages[imageIndex].likes = newLikes;
                    
                    // Update like count in DOM element
                    if (rawImages[imageIndex].element) {
                        const likeCountSpan = rawImages[imageIndex].element.querySelector('.card-like-count span');
                        if (likeCountSpan) {
                            likeCountSpan.textContent = newLikes;
                        }
                    }
                }
            });
            
            // Re-render current gallery with updated sorting
            await renderMasonryGrid(currentGallery);
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
// RESIZE HANDLER (NEW)
// ============================================

const handleResize = () => {
    const newColumnCount = getColumnCount();
    
    // Only re-render if column count actually changed
    if (newColumnCount !== currentColumnCount && galleryRawData[currentGallery]) {
        currentColumnCount = newColumnCount;
        renderMasonryGrid(currentGallery);
    }
};

// Debounced resize handler
let resizeTimeout;
const debouncedResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleResize, 150);
};

// ============================================
// EXISTING FUNCTIONS (keep as is)
// ============================================

const switchGalleryDescription = (galleryKey) => {
    const descriptions = document.querySelectorAll('.gallery-description');
    descriptions.forEach(desc => {
        if (desc.dataset.gallery === galleryKey) {
            desc.classList.remove('hidden');
        } else {
            desc.classList.add('hidden');
        }
    });
};

const setupFilters = () => {
    const filterTabs = document.querySelectorAll('.filter-tab');
    
    filterTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const galleryKey = tab.dataset.gallery;
            currentGallery = galleryKey;
            
            await renderMasonryGrid(galleryKey);
            switchGalleryDescription(galleryKey);
        });
    });
};

const setupBackToTop = () => {
    const backToTopBtn = document.getElementById('back-to-top');
    if (!backToTopBtn) return;
    
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 500) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });
    
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
};

// MODAL functions (keep as is)
const modal = document.getElementById('modal');
const modalImage = document.getElementById('modal-image');
const likeBtn = document.getElementById('like-btn');
const modalClose = modal.querySelector('.modal-close');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');

const openModal = (imageUrl, category = 'Image', galleryKey = currentGallery) => {
    currentModalImageUrl = imageUrl;
    modalImage.src = imageUrl;
    
    const visualImages = galleryVisualOrder[galleryKey] || [];
    currentGalleryImages = visualImages;
    currentModalImageIndex = visualImages.findIndex(img => img.url === imageUrl);
    
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    updateLikeButton();
    updateNavButtons();
};

const closeModal = () => {
    modal.setAttribute('hidden', '');
    currentModalImageUrl = null;
    currentModalImageIndex = -1;
    currentGalleryImages = [];
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
    const heart = likeBtn.querySelector('.heart');
    const count = likeBtn.querySelector('.count');
    
    if (count) count.textContent = likes;
    
    let isLiked = false;
    if (window.FUNCTIONAL_COOKIES_ENABLED) {
        const likedKey = `liked_${docId}`;
        isLiked = localStorage.getItem(likedKey) === 'true';
    }
    
    if (heart) {
        if (isLiked) {
            heart.classList.remove('far');
            heart.classList.add('fas', 'liked');
        } else {
            heart.classList.remove('fas', 'liked');
            heart.classList.add('far');
        }
    }
};

// GDPR COOKIE FUNCTIONS (keep as is)
const initCookieBanner = () => {
    const savedPrefs = localStorage.getItem('cookiePreferences');
    
    if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
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
    if (prefs.functional) {
        window.FUNCTIONAL_COOKIES_ENABLED = true;
        await initFirebase();
        await fetchAllLikes();
    }
    
    if (prefs.analytics) {
        window['ga-disable-G-5MGS0G4CDY'] = false;
        import('https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js')
            .then(({ getAnalytics }) => {
                if (app) {
                    analytics = getAnalytics(app);
                }
            });
    }
};

// INITIALIZATION
const init = async () => {
    try {
        console.log('🚀 Initializing...');
        
        initCookieBanner();
        
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        
        // Load data
        await loadManifest();
        
        if (window.FUNCTIONAL_COOKIES_ENABLED) {
            await fetchAllLikes();
        }
        
        // Set up event listeners
        setupFilters();
        setupBackToTop();
        
        // Initial render
        await renderMasonryGrid(currentGallery);
        
        // Set up resize handler
        window.addEventListener('resize', debouncedResize);
        
        // Set current column count
        currentColumnCount = getColumnCount();
        
        console.log('✅ Initialized successfully');
    } catch (error) {
        console.error('❌ Init error:', error);
        
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p>Error loading images. Please refresh.</p>';
        }
    }
};

// Set up event listeners
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});
likeBtn.addEventListener('click', toggleLike);
modalPrev.addEventListener('click', () => navigateModal('prev'));
modalNext.addEventListener('click', () => navigateModal('next'));

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!modal.hasAttribute('hidden')) {
        if (e.key === 'Escape') closeModal();
        else if (e.key === 'ArrowLeft') navigateModal('prev');
        else if (e.key === 'ArrowRight') navigateModal('next');
    }
});

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Cookie banner listeners (keep as is, just ensure they're included)
// ... [rest of your cookie consent code remains exactly the same] ...
// Cookie banner event listeners
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
    const footerCookieBtn = document.getElementById('footer-cookie-btn');
    
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
            
            // GDPR: Clear functional data when rejecting
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
    
    // Open settings modal from footer
    if (footerCookieBtn && cookieSettingsModal) {
        footerCookieBtn.addEventListener('click', () => {
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
                essential: true, // Always true
                analytics: analyticsCheckbox?.checked || false,
                functional: functionalCheckbox?.checked || false,
                marketing: marketingCheckbox?.checked || false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            
            console.log('💾 Saving cookie preferences:', prefs);
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            
            // GDPR: Clear functional data if being disabled
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
            // First, check all the boxes
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
            // First, uncheck all optional boxes
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
            
            // GDPR: Clear functional data when rejecting
            clearFunctionalCookieData();
            
            cookieSettingsModal.setAttribute('hidden', '');
            document.body.style.overflow = 'auto';
            location.reload();
        });
    }
});

// EVENT LISTENERS
modalClose.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeModal();
    }
});

likeBtn.addEventListener('click', toggleLike);

modalPrev.addEventListener('click', () => navigateModal('prev'));
modalNext.addEventListener('click', () => navigateModal('next'));

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

// INIT


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

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
