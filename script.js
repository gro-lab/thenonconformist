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

// GDPR: Functional cookies disabled by default until user explicitly accepts
window.FUNCTIONAL_COOKIES_ENABLED = false;

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
        for (let i = 1; i <= 50; i++) {
            manifest[dir].push({ 
                index: i, 
                ext: ext,
                originalName: `${dir}-${i}.${ext}`
            });
        }
    });
    
    imageManifest = manifest;
    console.log('📋 Using fallback manifest');
    return manifest;
};

// IMAGE URL - UPDATED to use originalName if available
const createImageUrl = (dir, imageData) => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    
    // Use originalName if available (new format), otherwise fall back to pattern
    const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
    
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}/${filename}`;
};

const getDocIdFromUrl = (url) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

// FIRESTORE
const fetchAllLikes = async () => {
    try {
        // GDPR: Only fetch likes if functional cookies enabled
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
        // GDPR: Only update likes if functional cookies enabled
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

// GALLERY GENERATION - UPDATED to pass full imageData object
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
        // UPDATED: Pass full imageData object instead of individual parameters
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

// COOKIE SETTINGS BUTTON (in footer)
const cookieSettingsBtn = document.getElementById('cookie-settings-btn');
if (cookieSettingsBtn) {
    cookieSettingsBtn.addEventListener('click', () => {
        const cookieCustomize = document.getElementById('cookie-customize');
        if (cookieCustomize) {
            cookieCustomize.classList.remove('hidden');
        }
    });
}

// GDPR COOKIE CONSENT BANNER
const initCookieBanner = () => {
    const savedPrefs = localStorage.getItem('cookiePreferences');
    
    if (savedPrefs) {
        // User already made choice
        const prefs = JSON.parse(savedPrefs);
        console.log('📋 Applying cookie preferences:', prefs);
        applyCookiePreferences(prefs);
    } else {
        // Show banner
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
    
    // Essential cookies (always enabled)
    
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
        // Import and initialize analytics
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
    
    // Verify what was saved
    const saved = localStorage.getItem('cookiePreferences');
    console.log('💾 Verified saved preferences:', JSON.parse(saved));
};

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
const init = async () => {
    try {
        console.log('🚀 Initializing...');
        
        // Initialize cookie banner first
        initCookieBanner();
        
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        
        // Load manifest (doesn't require cookies)
        const manifest = await loadManifest();
        
        // Fetch likes only if functional cookies enabled
        if (window.FUNCTIONAL_COOKIES_ENABLED) {
            await fetchAllLikes();
        }
        
        console.log('📊 Data loaded - rendering...');
        
        await renderMasonryGrid(currentGallery);
        setupFilters();
        setupBackToTop();
        
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