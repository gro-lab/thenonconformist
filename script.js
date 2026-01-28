// THE NONCONFORMIST - FULLY GDPR-COMPLIANT VERSION

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
    'low': { title: 'Language of Windows', dir: 'LoW' },
    'sol': { title: 'Snapshots of Life', dir: 'SoL' },
    'r': { title: 'Reflections', dir: 'R' },
    'sa': { title: 'Street Art', dir: 'SA' }
};

// STATE
let imageManifest = {};
let likesCache = {};
let currentModalImageUrl = null;
let currentModalImageIndex = -1;
let currentGalleryImages = [];
let isProcessing = false;
let currentGallery = 'low';
let galleryImages = {};

// GDPR: Functional cookies enabled flag (default: true until user explicitly rejects)
window.FUNCTIONAL_COOKIES_ENABLED = true;

// UTILITIES
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// MANIFEST LOADING
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
        for (let i = 1; i <= 5; i++) {
            manifest[dir].push({ index: i, ext: ext });
        }
    });
    
    imageManifest = manifest;
    console.log('📋 Using fallback manifest');
    return manifest;
};

// IMAGE URL
const createImageUrl = (dir, index, ext) => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}/${dir}-${index}.${ext}`;
};

const getDocIdFromUrl = (url) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

// FIRESTORE - GDPR PROTECTED
const fetchAllLikes = async () => {
    // GDPR: Only fetch if functional cookies enabled
    if (!window.FUNCTIONAL_COOKIES_ENABLED || !db) {
        console.log('🚫 Likes disabled - functional cookies not accepted');
        return {};
    }
    
    try {
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
    // GDPR: Only update if functional cookies enabled
    if (!window.FUNCTIONAL_COOKIES_ENABLED || !db) {
        console.log('🚫 Cannot update likes - functional cookies not accepted');
        return null;
    }
    
    try {
        const docId = getDocIdFromUrl(url);
        const docRef = doc(db, 'image_likes', docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            await updateDoc(docRef, {
                likes: increment(increment_value),
                lastUpdated: serverTimestamp()
            });
        } else {
            await setDoc(docRef, {
                url: url,
                likes: Math.max(0, increment_value),
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });
        }
        
        likesCache[docId] = (likesCache[docId] || 0) + increment_value;
        return likesCache[docId];
    } catch (error) {
        console.error('Error updating likes:', error);
        return null;
    }
};

// LAZY LOADING
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

// GALLERY GENERATION
const generateImageGrid = async (galleryKey) => {
    if (galleryImages[galleryKey]) {
        console.log(`✅ Gallery ${galleryKey} from cache`);
        return galleryImages[galleryKey];
    }
    
    const gallery = galleries[galleryKey];
    const dir = gallery.dir;
    const imageList = imageManifest[dir] || [];
    
    if (imageList.length === 0) {
        console.warn(`⚠️ No images for ${gallery.title}`);
        return [];
    }
    
    console.log(`📸 Loading ${imageList.length} images for ${gallery.title}`);
    
    const images = imageList.map(imageData => {
        const url = createImageUrl(dir, imageData.index, imageData.ext);
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
            gallery: galleryKey,
            category: gallery.title
        };
    });
    
    images.sort((a, b) => b.likes - a.likes);
    galleryImages[galleryKey] = images;
    
    console.log(`✅ Gallery ${gallery.title} loaded (${images.length} images)`);
    return images;
};

const renderMasonryGrid = async (galleryKey) => {
    const grid = document.getElementById('masonry-grid');
    if (!grid) return;
    
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    
    grid.innerHTML = '';
    
    const images = await generateImageGrid(galleryKey);
    
    images.forEach(({ element }) => {
        grid.appendChild(element);
    });
    
    if (loadingIndicator) {
        setTimeout(() => {
            loadingIndicator.classList.add('hidden');
        }, 300);
    }
    
    console.log(`✅ Rendered ${images.length} images for gallery: ${galleryKey}`);
};

// GALLERY DESCRIPTION
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

// FILTERS
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

// BACK TO TOP
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

// MODAL
const modal = document.getElementById('modal');
const modalImage = document.getElementById('modal-image');
const likeBtn = document.getElementById('like-btn');
const modalClose = modal.querySelector('.modal-close');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');

const openModal = (imageUrl, category = 'Image', galleryKey = currentGallery) => {
    currentModalImageUrl = imageUrl;
    modalImage.src = imageUrl;
    
    // Get current gallery images and find index
    const images = galleryImages[galleryKey] || [];
    currentGalleryImages = images;
    currentModalImageIndex = images.findIndex(img => img.url === imageUrl);
    
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
    
    const likedKey = `liked_${docId}`;
    const isLiked = localStorage.getItem(likedKey) === 'true';
    
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

const toggleLike = async () => {
    if (!currentModalImageUrl || isProcessing) return;
    
    // GDPR: Check if functional cookies are enabled
    if (window.FUNCTIONAL_COOKIES_ENABLED === false) {
        alert('Please enable functional cookies in cookie settings to use the like feature.');
        return;
    }
    
    isProcessing = true;
    likeBtn.disabled = true;
    
    const docId = getDocIdFromUrl(currentModalImageUrl);
    const likedKey = `liked_${docId}`;
    const isCurrentlyLiked = localStorage.getItem(likedKey) === 'true';
    
    try {
        const increment_value = isCurrentlyLiked ? -1 : 1;
        await updateLike(currentModalImageUrl, increment_value);
        
        if (isCurrentlyLiked) {
            localStorage.removeItem(likedKey);
        } else {
            localStorage.setItem(likedKey, 'true');
        }
        
        updateLikeButton();
        
        // Update grid
        const imageCard = document.querySelector(`.image-card[data-url="${currentModalImageUrl}"]`);
        if (imageCard) {
            const likeCountSpan = imageCard.querySelector('.card-like-count span');
            if (likeCountSpan) {
                likeCountSpan.textContent = likesCache[docId];
            }
        }
    } catch (error) {
        console.error('Error toggling like:', error);
    } finally {
        isProcessing = false;
        likeBtn.disabled = false;
    }
};

// TERMS MODAL
const termsModal = document.getElementById('terms-modal');
const termsBtn = document.getElementById('terms-btn');
const termsClose = termsModal.querySelector('.modal-close');

termsBtn.addEventListener('click', () => {
    termsModal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
});

termsClose.addEventListener('click', () => {
    termsModal.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
});

termsModal.addEventListener('click', (e) => {
    if (e.target === termsModal) {
        termsModal.setAttribute('hidden', '');
        document.body.style.overflow = 'auto';
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

// ============================================
// COOKIE CONSENT MANAGEMENT - GDPR COMPLIANT
// ============================================

const COOKIE_CONSENT_KEY = 'cookie_consent_preferences';
const COOKIE_CONSENT_VERSION = '1.0';

const cookieBanner = document.getElementById('cookie-banner');
const cookieSettingsModal = document.getElementById('cookie-settings-modal');
const cookieFloatBtn = document.getElementById('cookie-float-btn');

// Check if user has already set preferences
const checkCookieConsent = () => {
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved) {
        try {
            const preferences = JSON.parse(saved);
            if (preferences.version === COOKIE_CONSENT_VERSION) {
                applyCookiePreferences(preferences);
                return true;
            }
        } catch (e) {
            console.error('Error parsing cookie preferences:', e);
        }
    }
    return false;
};

// Show cookie banner if no consent given
const showCookieBanner = () => {
    if (!checkCookieConsent()) {
        cookieBanner.removeAttribute('hidden');
    }
};

// Apply cookie preferences - FULLY GDPR COMPLIANT
const applyCookiePreferences = async (preferences) => {
    console.log('📋 Applying cookie preferences:', preferences);
    
    // ============================================
    // ANALYTICS COOKIES - Firebase Analytics
    // ============================================
    if (preferences.analytics && analytics === null) {
        // User ACCEPTED analytics - lazy load Firebase Analytics
        try {
            // Ensure Firebase app is initialized first
            if (!app) {
                await initFirebase();
            }
            const { getAnalytics } = await import('https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js');
            analytics = getAnalytics(app);
            console.log('✅ Analytics enabled after consent');
        } catch (error) {
            console.error('❌ Failed to load analytics:', error);
        }
    } else if (!preferences.analytics && analytics !== null) {
        // User REJECTED analytics - disable it
        analytics = null;
        console.log('🚫 Analytics disabled');
    }
    
    // ============================================
    // FUNCTIONAL COOKIES - Firebase + Likes
    // ============================================
    if (preferences.functional && !db) {
        // User ACCEPTED functional cookies - initialize Firebase and load likes
        window.FUNCTIONAL_COOKIES_ENABLED = true;
        await initFirebase();
        await fetchAllLikes();
        
        // Re-render current gallery with likes data
        await renderMasonryGrid(currentGallery);
        
        console.log('✅ Functional cookies enabled - likes feature active');
    } else if (!preferences.functional) {
        // User REJECTED functional cookies - disable likes
        window.FUNCTIONAL_COOKIES_ENABLED = false;
        likesCache = {};
        
        // Re-render gallery without likes (if already rendered)
        if (galleryImages[currentGallery]) {
            await renderMasonryGrid(currentGallery);
        }
        
        console.log('🚫 Functional cookies disabled - likes feature disabled');
    } else if (preferences.functional) {
        window.FUNCTIONAL_COOKIES_ENABLED = true;
        console.log('✅ Functional cookies remain enabled');
    }
    
    // ============================================
    // MARKETING COOKIES - Not currently used
    // ============================================
    if (!preferences.marketing) {
        console.log('🚫 Marketing cookies disabled');
    }
};

// Save cookie preferences
const saveCookiePreferences = (preferences) => {
    const toSave = {
        ...preferences,
        version: COOKIE_CONSENT_VERSION,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(toSave));
    applyCookiePreferences(toSave);
};

// Get current preferences from UI
const getCurrentPreferences = () => {
    return {
        essential: true, // Always true
        analytics: document.getElementById('analytics-cookies')?.checked || false,
        functional: document.getElementById('functional-cookies')?.checked || false,
        marketing: document.getElementById('marketing-cookies')?.checked || false
    };
};

// Set preferences in UI
const setPreferencesInUI = (preferences) => {
    if (document.getElementById('analytics-cookies')) {
        document.getElementById('analytics-cookies').checked = preferences.analytics !== false;
    }
    if (document.getElementById('functional-cookies')) {
        document.getElementById('functional-cookies').checked = preferences.functional !== false;
    }
    if (document.getElementById('marketing-cookies')) {
        document.getElementById('marketing-cookies').checked = preferences.marketing !== false;
    }
};

// Accept all cookies
document.getElementById('cookie-accept-btn')?.addEventListener('click', () => {
    saveCookiePreferences({
        essential: true,
        analytics: true,
        functional: true,
        marketing: true
    });
    cookieBanner.setAttribute('hidden', '');
});

// Reject all cookies (except essential)
document.getElementById('cookie-reject-btn')?.addEventListener('click', () => {
    saveCookiePreferences({
        essential: true,
        analytics: false,
        functional: false,
        marketing: false
    });
    cookieBanner.setAttribute('hidden', '');
});

// Open cookie settings from banner
document.getElementById('cookie-settings-btn')?.addEventListener('click', () => {
    cookieBanner.setAttribute('hidden', '');
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved) {
        try {
            const preferences = JSON.parse(saved);
            setPreferencesInUI(preferences);
        } catch (e) {
            // Use defaults
        }
    }
    cookieSettingsModal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
});

// Open cookie settings from footer
document.getElementById('footer-cookie-btn')?.addEventListener('click', () => {
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved) {
        try {
            const preferences = JSON.parse(saved);
            setPreferencesInUI(preferences);
        } catch (e) {
            // Use defaults
        }
    }
    cookieSettingsModal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
});

// Open cookie settings from floating button
cookieFloatBtn?.addEventListener('click', () => {
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved) {
        try {
            const preferences = JSON.parse(saved);
            setPreferencesInUI(preferences);
        } catch (e) {
            // Use defaults
        }
    }
    cookieSettingsModal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
});

// Close cookie settings modal
cookieSettingsModal?.querySelector('.modal-close')?.addEventListener('click', () => {
    cookieSettingsModal.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
});

// Click outside to close
cookieSettingsModal?.addEventListener('click', (e) => {
    if (e.target === cookieSettingsModal) {
        cookieSettingsModal.setAttribute('hidden', '');
        document.body.style.overflow = 'auto';
    }
});

// Save preferences from modal
document.getElementById('cookie-save-btn')?.addEventListener('click', () => {
    const preferences = getCurrentPreferences();
    saveCookiePreferences(preferences);
    cookieSettingsModal.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
});

// Accept all from modal
document.getElementById('cookie-accept-all-btn')?.addEventListener('click', () => {
    saveCookiePreferences({
        essential: true,
        analytics: true,
        functional: true,
        marketing: true
    });
    cookieSettingsModal.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
});

// Reject all from modal
document.getElementById('cookie-reject-all-btn')?.addEventListener('click', () => {
    saveCookiePreferences({
        essential: true,
        analytics: false,
        functional: false,
        marketing: false
    });
    cookieSettingsModal.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
});

// ============================================
// INIT - GDPR COMPLIANT VERSION
// ============================================
const init = async () => {
    try {
        console.log('🚀 Initializing...');
        
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        
        // Load manifest (no consent needed - just image paths)
        await loadManifest();
        
        // GDPR CRITICAL: Only initialize Firebase and fetch likes if functional cookies enabled
        if (window.FUNCTIONAL_COOKIES_ENABLED) {
            await initFirebase();
            await fetchAllLikes();
        } else {
            likesCache = {};  // Empty cache if no consent
        }
        
        console.log('📊 Data loaded - rendering...');
        
        await renderMasonryGrid(currentGallery);
        setupFilters();
        setupBackToTop();
        
        // Show cookie banner if consent not given
        setTimeout(showCookieBanner, 500);
        
        console.log('✅ Initialized successfully');
    } catch (error) {
        console.error('❌ Init error:', error);
        
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p>Error loading images. Please refresh.</p>';
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
