// ============================================
// THE NONCONFORMIST - Script (OPTIMIZED v2.0)
// ============================================
// Performance Optimizations:
// - Native lazy loading
// - WebP format with fallback
// - Service Worker caching
// - Responsive images (srcset)
// - Batch-load visible gallery only
// - Preconnect headers (in HTML)

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
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js';

// ============================================
// FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
    authDomain: "thenonconformistdotxyz.firebaseapp.com",
    projectId: "thenonconformistdotxyz",
    storageBucket: "thenonconformistdotxyz.firebasestorage.app",
    messagingSenderId: "552037212425",
    appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8",
    measurementId: "G-5MGS0G4CDY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// ============================================
// GALLERY CONFIGURATION
// ============================================

const galleries = {
    'low': {
        title: 'Language of Windows',
        dir: 'LoW'
    },
    'sol': {
        title: 'Snapshots of Life',
        dir: 'SoL'
    },
    'r': {
        title: 'Reflections',
        dir: 'R'
    },
    'sa': {
        title: 'Street Art',
        dir: 'SA'
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let imageManifest = {};
let likesCache = {};
let currentModalImageUrl = null;
let isProcessing = false;
let currentGallery = 'low'; // Default to first gallery
let galleryImages = {}; // Store loaded images per gallery
let webpSupported = false; // WebP support detection

// ============================================
// PERFORMANCE UTILITIES
// ============================================

const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// ============================================
// WEBP SUPPORT DETECTION
// ============================================

const checkWebPSupport = () => {
    return new Promise((resolve) => {
        const webp = new Image();
        webp.onload = webp.onerror = () => {
            resolve(webp.height === 2);
        };
        webp.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
    });
};

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registered:', registration);
        } catch (error) {
            console.log('⚠️ Service Worker registration failed:', error);
        }
    }
};

// ============================================
// MANIFEST LOADING
// ============================================

const loadManifest = async () => {
    try {
        const owner = 'gro-lab';
        const repo = 'thenonconformist';
        const branch = 'main';
        
        const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/manifest.json`;
        
        console.log('📦 Loading image manifest...');
        const response = await fetch(manifestUrl);
        
        if (!response.ok) {
            console.warn('⚠️ Manifest not found, using fallback...');
            return generateFallbackManifest();
        }
        
        imageManifest = await response.json();
        console.log('✅ Manifest loaded:', imageManifest);
        return imageManifest;
    } catch (error) {
        console.warn('⚠️ Error loading manifest, using fallback:', error);
        return generateFallbackManifest();
    }
};

// Fallback if manifest.json doesn't exist yet
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
        // Assume 50 images per gallery
        for (let i = 1; i <= 50; i++) {
            manifest[dir].push({
                index: i,
                ext: ext
            });
        }
    });
    
    imageManifest = manifest;
    console.log('📋 Using fallback manifest with 50 images per gallery');
    return manifest;
};

// ============================================
// IMAGE URL CREATION (WITH WEBP SUPPORT)
// ============================================

const createImageUrl = (dir, index, ext, size = 'medium') => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    
    // Prefer WebP if supported (70-90% smaller than JPEG)
    const format = webpSupported ? 'webp' : ext;
    
    // Base URL structure
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}/${dir}-${index}.${format}`;
};

// Create responsive srcset for different sizes
const createResponsiveSrcset = (dir, index, ext) => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    
    const format = webpSupported ? 'webp' : ext;
    const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}`;
    
    // Generate srcset for different viewport sizes
    // Assuming you have or will create these sizes
    return `
        ${baseUrl}/small/${dir}-${index}.${format} 400w,
        ${baseUrl}/medium/${dir}-${index}.${format} 800w,
        ${baseUrl}/${dir}-${index}.${format} 1600w
    `.trim();
};

const getDocIdFromUrl = (url) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

// ============================================
// FIRESTORE OPERATIONS
// ============================================

const fetchAllLikes = async () => {
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
    try {
        const docId = getDocIdFromUrl(url);
        const docRef = doc(db, 'image_likes', docId);
        
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            // Update existing document
            await updateDoc(docRef, {
                likes: increment(increment_value),
                lastUpdated: serverTimestamp()
            });
        } else {
            // Create new document
            await setDoc(docRef, {
                url: url,
                likes: Math.max(0, increment_value),
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });
        }
        
        // Update local cache
        likesCache[docId] = (likesCache[docId] || 0) + increment_value;
        return likesCache[docId];
    } catch (error) {
        console.error('Error updating likes:', error);
        return null;
    }
};

// ============================================
// OPTIMIZED LAZY LOADING
// ============================================

const setupLazyLoading = (img, priority = false) => {
    const options = {
        rootMargin: priority ? '800px' : '400px', // Larger margin for priority images
        threshold: 0.01
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const image = entry.target;
                const src = image.dataset.src;
                const srcset = image.dataset.srcset;
                
                if (src && !image.classList.contains('loaded')) {
                    // Create a new image to preload
                    const preloader = new Image();
                    
                    preloader.onload = () => {
                        if (srcset) {
                            image.srcset = srcset;
                        }
                        image.src = src;
                        image.classList.add('loaded');
                        image.style.opacity = '1';
                    };
                    
                    preloader.onerror = () => {
                        console.warn(`Failed to load: ${src}`);
                        // Try fallback to original format
                        if (webpSupported) {
                            const fallbackSrc = src.replace('.webp', '.JPEG').replace('.webp', '.PNG');
                            preloader.src = fallbackSrc;
                        } else {
                            image.remove(); // Remove broken images
                        }
                    };
                    
                    if (srcset) {
                        preloader.srcset = srcset;
                    }
                    preloader.src = src;
                }
                
                observer.unobserve(image);
            }
        });
    }, options);
    
    observer.observe(img);
};

// ============================================
// IMAGE GRID GENERATION (OPTIMIZED - BATCH LOADING)
// ============================================

const generateImageGrid = async (galleryKey) => {
    // Check if gallery is already loaded
    if (galleryImages[galleryKey]) {
        console.log(`✅ Gallery ${galleryKey} already loaded from cache`);
        return galleryImages[galleryKey];
    }
    
    const gallery = galleries[galleryKey];
    const dir = gallery.dir;
    const imageList = imageManifest[dir] || [];
    
    if (imageList.length === 0) {
        console.warn(`⚠️ No images found for ${gallery.title}`);
        return [];
    }
    
    console.log(`📸 Loading ${imageList.length} images for ${gallery.title}`);
    
    // Create image card elements
    const images = imageList.map((imageData, index) => {
        const url = createImageUrl(dir, imageData.index, imageData.ext);
        const docId = getDocIdFromUrl(url);
        const likes = likesCache[docId] || 0;
        
        // Determine if this is a priority image (first 10 visible)
        const isPriority = index < 10;
        
        // Create card wrapper
        const card = document.createElement('div');
        card.className = 'image-card';
        card.dataset.gallery = galleryKey;
        card.dataset.url = url;
        card.dataset.category = gallery.title;
        
        // Create image element
        const img = document.createElement('img');
        
        // Use transparent placeholder
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        
        // Store actual source in data attributes
        img.dataset.src = url;
        
        // Add responsive srcset for different screen sizes
        // NOTE: You'll need to create these sized versions of your images
        // For now, we'll use the main image
        img.dataset.srcset = createResponsiveSrcset(dir, imageData.index, imageData.ext);
        
        // Define sizes for responsive loading
        img.sizes = "(max-width: 600px) 400px, (max-width: 1200px) 800px, 1600px";
        
        img.alt = `${gallery.title} - Image ${imageData.index}`;
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';
        
        // OPTIMIZATION: Native lazy loading
        img.loading = isPriority ? 'eager' : 'lazy';
        
        // Add decoding hint for browser optimization
        img.decoding = isPriority ? 'sync' : 'async';
        
        // Create like count badge
        const likeCount = document.createElement('div');
        likeCount.className = 'card-like-count';
        likeCount.innerHTML = `<i class="fas fa-heart"></i> <span>${likes}</span>`;
        
        // Append elements
        card.appendChild(img);
        card.appendChild(likeCount);
        
        // Click to open modal
        card.addEventListener('click', () => openModal(url, gallery.title));
        
        // Setup lazy loading with Intersection Observer (for fade-in effect)
        setupLazyLoading(img, isPriority);
        
        return { 
            element: card, 
            url: url, 
            likes: likes,
            gallery: galleryKey,
            category: gallery.title,
            isPriority: isPriority
        };
    });
    
    // Sort by likes (most liked first)
    images.sort((a, b) => b.likes - a.likes);
    
    // Cache the loaded gallery
    galleryImages[galleryKey] = images;
    
    console.log(`✅ Gallery ${gallery.title} loaded (${images.length} images)`);
    return images;
};

// ============================================
// RENDER MASONRY GRID (BATCH RENDERING)
// ============================================

const renderMasonryGrid = async (galleryKey) => {
    const grid = document.getElementById('masonry-grid');
    if (!grid) return;
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    
    // Clear grid
    grid.innerHTML = '';
    
    // Load the selected gallery (will use cache if already loaded)
    const images = await generateImageGrid(galleryKey);
    
    // OPTIMIZATION: Batch rendering to avoid layout thrashing
    const fragment = document.createDocumentFragment();
    
    // Append all images to fragment first (off-DOM)
    images.forEach(({ element }) => {
        fragment.appendChild(element);
    });
    
    // Single DOM update
    grid.appendChild(fragment);
    
    // Hide loading indicator
    if (loadingIndicator) {
        setTimeout(() => {
            loadingIndicator.classList.add('hidden');
        }, 300);
    }
    
    console.log(`✅ Rendered ${images.length} images for gallery: ${galleryKey}`);
};

// ============================================
// FILTER FUNCTIONALITY (Gallery Switcher)
// ============================================

const setupFilters = () => {
    const filterTabs = document.querySelectorAll('.filter-tab');
    
    filterTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // Remove active class from all tabs
            filterTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Get gallery key
            const galleryKey = tab.dataset.gallery;
            currentGallery = galleryKey;
            
            // Load and render the selected gallery
            await renderMasonryGrid(galleryKey);
        });
    });
};

// ============================================
// BACK TO TOP BUTTON
// ============================================

const setupBackToTop = () => {
    const backToTopBtn = document.getElementById('back-to-top');
    
    if (!backToTopBtn) return;
    
    const handleScroll = debounce(() => {
        if (window.pageYOffset > 500) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    }, 100);
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
};

// ============================================
// MODAL OPERATIONS
// ============================================

const modal = document.getElementById('modal');
const modalImage = document.getElementById('modal-image');
const likeBtn = document.getElementById('like-btn');
const modalClose = modal.querySelector('.modal-close');

const openModal = (imageUrl, category = 'Image') => {
    currentModalImageUrl = imageUrl;
    
    // OPTIMIZATION: Preload full-size image
    const preloader = new Image();
    preloader.onload = () => {
        modalImage.src = imageUrl;
    };
    preloader.src = imageUrl;
    
    // Update modal info
    const modalTitle = document.getElementById('modal-title');
    const modalCategory = document.getElementById('modal-category');
    
    if (modalTitle) modalTitle.textContent = category;
    if (modalCategory) modalCategory.textContent = category;
    
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    updateLikeButton();
};

const closeModal = () => {
    modal.setAttribute('hidden', '');
    currentModalImageUrl = null;
    document.body.style.overflow = 'auto';
};

const updateLikeButton = () => {
    if (!currentModalImageUrl) return;
    
    const docId = getDocIdFromUrl(currentModalImageUrl);
    const likes = likesCache[docId] || 0;
    const heart = likeBtn.querySelector('.heart');
    const count = likeBtn.querySelector('.count');
    
    if (count) count.textContent = likes;
    
    // Check if user has liked (using localStorage for session)
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
        
        // Update the like count in the grid view too
        const cards = document.querySelectorAll(`.image-card[data-url="${currentModalImageUrl}"]`);
        cards.forEach(card => {
            const likeCountEl = card.querySelector('.card-like-count span');
            if (likeCountEl) {
                likeCountEl.textContent = likesCache[docId];
            }
        });
        
    } catch (error) {
        console.error('Error toggling like:', error);
    } finally {
        isProcessing = false;
        likeBtn.disabled = false;
    }
};

// ============================================
// TERMS & CONDITIONS
// ============================================

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

// ============================================
// EVENT LISTENERS
// ============================================

modalClose.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeModal();
    }
});

likeBtn.addEventListener('click', toggleLike);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        closeModal();
    }
});

// ============================================
// PRELOAD CRITICAL RESOURCES
// ============================================

const preloadCriticalImages = () => {
    // Preload the first 3 images of the default gallery
    const gallery = galleries[currentGallery];
    const dir = gallery.dir;
    const imageList = imageManifest[dir] || [];
    
    imageList.slice(0, 3).forEach(imageData => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = createImageUrl(dir, imageData.index, imageData.ext);
        document.head.appendChild(link);
    });
    
    console.log('🚀 Preloaded critical images');
};

// ============================================
// INITIALIZATION
// ============================================

const init = async () => {
    try {
        console.log('🚀 Initializing The Nonconformist (Optimized)...');
        
        // Show loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        
        // OPTIMIZATION 1: Check WebP support
        webpSupported = await checkWebPSupport();
        console.log(`📷 WebP supported: ${webpSupported ? 'Yes' : 'No'}`);
        
        // OPTIMIZATION 2: Register Service Worker for caching
        registerServiceWorker();
        
        // OPTIMIZATION 3: Load manifest and likes in parallel
        const [manifest, likes] = await Promise.all([
            loadManifest(),
            fetchAllLikes()
        ]);
        
        console.log('📊 Data loaded - rendering default gallery...');
        
        // OPTIMIZATION 4: Preload critical images
        preloadCriticalImages();
        
        // OPTIMIZATION 5: Only load and render the default gallery (Language of Windows)
        await renderMasonryGrid(currentGallery);
        
        // Setup filter tabs (for switching between galleries)
        setupFilters();
        
        // Setup back to top button
        setupBackToTop();
        
        console.log('✅ The Nonconformist initialized successfully');
        console.log(`⚡ Performance mode: ${webpSupported ? 'WebP' : 'Standard'}`);
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        
        // Hide loading indicator on error
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p>Error loading images. Please refresh the page.</p>';
        }
    }
};

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}