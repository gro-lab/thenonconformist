// THE NONCONFORMIST - GDPR Compliant Version
// ✅ Firebase SDK loaded dynamically ONLY after user consent

// ============================================
// FIREBASE - LOADED DYNAMICALLY AFTER CONSENT
// ============================================
let firebaseModules = null;
let app = null;
let db = null;

// Dynamic Firebase loader - only called after consent
const loadFirebaseSDK = async () => {
    if (firebaseModules) {
        console.log('✅ Firebase SDK already loaded');
        return firebaseModules;
    }
    
    console.log('📦 Loading Firebase SDK dynamically...');
    
    try {
        // Load Firebase modules only when needed
        const [appModule, firestoreModule] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js')
        ]);
        
        firebaseModules = {
            initializeApp: appModule.initializeApp,
            getFirestore: firestoreModule.getFirestore,
            collection: firestoreModule.collection,
            doc: firestoreModule.doc,
            getDoc: firestoreModule.getDoc,
            setDoc: firestoreModule.setDoc,
            updateDoc: firestoreModule.updateDoc,
            increment: firestoreModule.increment,
            getDocs: firestoreModule.getDocs,
            serverTimestamp: firestoreModule.serverTimestamp
        };
        
        console.log('✅ Firebase SDK loaded successfully');
        return firebaseModules;
    } catch (error) {
        console.error('❌ Failed to load Firebase SDK:', error);
        throw error;
    }
};

// Firebase initialization - only after SDK is loaded
const initFirebase = async () => {
    if (app) {
        console.log('✅ Firebase already initialized');
        return;
    }
    
    // Ensure SDK is loaded first
    const firebase = await loadFirebaseSDK();
    
    // FIREBASE CONFIG (measurementId removed - no Google Analytics)
    const firebaseConfig = {
        apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
        authDomain: "thenonconformistdotxyz.firebaseapp.com",
        projectId: "thenonconformistdotxyz",
        storageBucket: "thenonconformistdotxyz.firebasestorage.app",
        messagingSenderId: "552037212425",
        appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8"
    };
    
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.getFirestore(app);
    console.log('✅ Firebase initialized');
};

// Teardown function for consent withdrawal
const teardownFirebase = () => {
    if (app) {
        console.log('🔥 Disconnecting Firebase...');
        app = null;
        db = null;
        firebaseModules = null;
        likesCache = {};
        window.FUNCTIONAL_COOKIES_ENABLED = false;
        console.log('✅ Firebase disconnected and cleaned up');
    }
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

// STATE
let imageManifest = {};
let likesCache = {};
let currentModalImageUrl = null;
let currentModalImageIndex = -1;
let currentGalleryImages = [];
let isProcessing = false;
let currentGallery = 'low';
let galleryImageData = {};
let isDragging = false;
let startX = 0;
let startY = 0;
let scrollX = 0;
let scrollY = 0;
let scrollLimits = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

window.FUNCTIONAL_COOKIES_ENABLED = false;

// STABLE SORT BY LIKES - DESCENDING ORDER
const stableSortByLikes = (items) => {
    return [...items].sort((a, b) => {
        // Sort by likes descending (most likes first)
        if (b.likes !== a.likes) return b.likes - a.likes;
        // If same likes, maintain original order
        return a.originalIndex - b.originalIndex;
    });
};

// LOAD MANIFEST
const loadManifest = async () => {
    try {
        const owner = 'gro-lab';
        const repo = 'thenonconformist';
        const branch = 'main';
        const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images.json`;
        
        const response = await fetch(manifestUrl);
        
        if (!response.ok) {
            return generateFallbackManifest();
        }
        
        imageManifest = await response.json();
        console.log('✅ Manifest loaded');
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

// FIRESTORE - GDPR COMPLIANT
const fetchAllLikes = async () => {
    try {
        if (!window.FUNCTIONAL_COOKIES_ENABLED || !db) {
            console.log('⚠️ Functional cookies not enabled or Firebase not initialized, skipping likes fetch');
            return {};
        }
        
        console.log('📊 Fetching all likes from Firestore...');
        
        // ✅ GDPR FIX: Use dynamically loaded Firebase modules
        const firebase = firebaseModules;
        const querySnapshot = await firebase.getDocs(firebase.collection(db, 'image_likes'));
        const likes = {};
        querySnapshot.forEach((doc) => {
            likes[doc.id] = doc.data().likes || 0;
        });
        likesCache = likes;
        console.log(`❤️ Loaded ${Object.keys(likes).length} likes from Firestore`);
        return likes;
    } catch (error) {
        console.error('Error fetching likes:', error);
        return {};
    }
};

const updateLike = async (url, increment_value) => {
    try {
        if (!window.FUNCTIONAL_COOKIES_ENABLED || !db) {
            console.log('⚠️ Functional cookies not enabled, cannot update likes');
            return null;
        }
        
        // ✅ GDPR FIX: Use dynamically loaded Firebase modules
        const firebase = firebaseModules;
        const docId = getDocIdFromUrl(url);
        const docRef = firebase.doc(db, 'image_likes', docId);
        const docSnap = await firebase.getDoc(docRef);
        
        if (docSnap.exists()) {
            await firebase.updateDoc(docRef, {
                likes: firebase.increment(increment_value),
                lastUpdated: firebase.serverTimestamp()
            });
            const updatedSnap = await firebase.getDoc(docRef);
            const newLikes = updatedSnap.data().likes;
            likesCache[docId] = newLikes;
            return newLikes;
        } else {
            const initialLikes = Math.max(0, increment_value);
            await firebase.setDoc(docRef, {
                url: url,
                likes: initialLikes,
                createdAt: firebase.serverTimestamp(),
                lastUpdated: firebase.serverTimestamp()
            });
            likesCache[docId] = initialLikes;
            return initialLikes;
        }
    } catch (error) {
        console.error('Error updating likes:', error);
        return null;
    }
};

// LOAD GALLERY DATA
const loadGalleryData = async (galleryKey) => {
    const gallery = galleries[galleryKey];
    const dir = gallery.dir;
    const imageList = imageManifest[dir] || [];
    
    if (imageList.length === 0) {
        return [];
    }
    
    const images = imageList.map((imageData, originalIndex) => {
        const url = createImageUrl(dir, imageData);
        const docId = getDocIdFromUrl(url);
        // Default to 0 if likesCache doesn't have it yet
        const likes = likesCache[docId] !== undefined ? likesCache[docId] : 0;
        
        console.log(`📷 ${galleryKey} image ${imageData.index}: ${likes} likes`);
        
        return {
            url,
            likes,
            originalIndex,
            gallery: galleryKey,
            width: imageData.width,
            height: imageData.height,
            aspectRatio: imageData.aspectRatio,
            orientation: imageData.orientation,
            aspectDecimal: imageData.aspectDecimal
        };
    });
    
    const sortedImages = stableSortByLikes(images);
    console.log(`✅ Loaded ${sortedImages.length} images for ${gallery.title}, sorted by likes`);
    
    return sortedImages;
};

// SETUP GALLERY SELECTOR
const setupGallerySelector = async () => {
    const gallerySelector = document.getElementById('gallery-selector');
    const galleryCovers = document.querySelectorAll('.gallery-cover');
    
    // Load counts for all galleries
    for (const key of Object.keys(galleries)) {
        const countElement = document.getElementById(`${key}-count`);
        const galleryData = await loadGalleryData(key);
        galleryImageData[key] = galleryData;
        
        if (countElement) {
            countElement.textContent = `${galleryData.length} images`;
        }
    }
    
    // Add click handlers
    galleryCovers.forEach(cover => {
        cover.addEventListener('click', async () => {
            const galleryKey = cover.dataset.gallery;
            await openGallery(galleryKey);
        });
    });
};

// OPEN GALLERY
const openGallery = async (galleryKey) => {
    currentGallery = galleryKey;
    const gallery = galleries[galleryKey];
    const gallerySelector = document.getElementById('gallery-selector');
    const galleryContent = document.getElementById('gallery-content');
    const galleryTitle = document.getElementById('current-gallery-title');
    const gallerySubtitle = document.getElementById('current-gallery-subtitle');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Show loading
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
    
    // Hide selector, show content
    gallerySelector.style.display = 'none';
    galleryContent.style.display = 'block';
    
    // Set title and subtitle
    if (galleryTitle) {
        galleryTitle.textContent = gallery.title;
        galleryTitle.style.color = gallery.color;
    }
    if (gallerySubtitle) {
        gallerySubtitle.textContent = gallery.subtitle;
    }
    
    // Load gallery images
    const images = galleryImageData[galleryKey] || await loadGalleryData(galleryKey);
    currentGalleryImages = images;
    
    // Render masonry grid
    renderMasonryGrid(images);
    
    // Hide loading
    setTimeout(() => {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }, 500);
    
    // Reset scroll position
    resetCanvasPosition();
};

// RENDER MASONRY GRID
const renderMasonryGrid = (images) => {
    const grid = document.getElementById('masonry-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    images.forEach((imageData, index) => {
        const item = document.createElement('div');
        item.className = 'masonry-item';
        
        const img = document.createElement('img');
        img.dataset.src = imageData.url;
        img.alt = `Image ${index + 1}`;
        img.className = 'masonry-img lazy-load';
        
        // Add loading placeholder
        img.style.background = 'linear-gradient(45deg, #2a2a2a 25%, #333 25%, #333 50%, #2a2a2a 50%, #2a2a2a 75%, #333 75%, #333)';
        img.style.backgroundSize = '20px 20px';
        
        // Add click handler
        img.addEventListener('click', () => {
            openModal(imageData.url, index);
        });
        
        item.appendChild(img);
        grid.appendChild(item);
    });
    
    // Initialize lazy loading
    initLazyLoading();
};

// LAZY LOADING
const initLazyLoading = () => {
    const lazyImages = document.querySelectorAll('.lazy-load');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.dataset.src;
                
                if (src) {
                    img.src = src;
                    img.classList.add('loaded');
                    observer.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '200px'
    });
    
    lazyImages.forEach(img => imageObserver.observe(img));
};

// CANVAS NAVIGATION
const setupCanvasNavigation = () => {
    const canvas = document.getElementById('infinite-canvas');
    const container = document.getElementById('canvas-transform-container');
    
    if (!canvas || !container) return;
    
    // Mouse/Touch drag
    canvas.addEventListener('mousedown', handleDragStart);
    canvas.addEventListener('touchstart', handleDragStart, { passive: false });
    
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);
    
    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNav);
    
    // Wheel/scroll
    canvas.addEventListener('wheel', handleWheel, { passive: false });
};

const handleDragStart = (e) => {
    isDragging = true;
    const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
    const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
    
    startX = clientX - scrollX;
    startY = clientY - scrollY;
};

const handleDragMove = (e) => {
    if (!isDragging) return;
    
    e.preventDefault();
    const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
    const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
    
    scrollX = clientX - startX;
    scrollY = clientY - startY;
    
    // Apply constraints
    scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
    scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
    
    updateCanvasPosition();
};

const handleDragEnd = () => {
    isDragging = false;
};

const handleKeyboardNav = (e) => {
    if (!document.getElementById('gallery-content') || document.getElementById('gallery-content').style.display === 'none') return;
    
    const step = 100;
    
    switch (e.key) {
        case 'ArrowLeft':
            scrollX += step;
            break;
        case 'ArrowRight':
            scrollX -= step;
            break;
        case 'ArrowUp':
            scrollY += step;
            break;
        case 'ArrowDown':
            scrollY -= step;
            break;
        default:
            return;
    }
    
    e.preventDefault();
    scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
    scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
    updateCanvasPosition();
};

const handleWheel = (e) => {
    e.preventDefault();
    
    scrollX -= e.deltaX;
    scrollY -= e.deltaY;
    
    scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
    scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
    
    updateCanvasPosition();
};

const updateCanvasPosition = () => {
    const container = document.getElementById('canvas-transform-container');
    if (container) {
        container.style.transform = `translate(${scrollX}px, ${scrollY}px)`;
    }
};

const resetCanvasPosition = () => {
    scrollX = 0;
    scrollY = 0;
    updateCanvasPosition();
    calculateScrollLimits();
};

const calculateScrollLimits = () => {
    const canvas = document.getElementById('infinite-canvas');
    const container = document.getElementById('canvas-transform-container');
    
    if (!canvas || !container) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const maxScrollX = canvasRect.width - containerRect.width;
    const maxScrollY = canvasRect.height - containerRect.height;
    
    scrollLimits = {
        minX: -Math.max(0, containerRect.width - canvasRect.width),
        maxX: Math.max(0, maxScrollX),
        minY: -Math.max(0, containerRect.height - canvasRect.height),
        maxY: Math.max(0, maxScrollY)
    };
};

// BACK BUTTON
const setupBackButton = () => {
    const backButton = document.getElementById('back-button');
    const gallerySelector = document.getElementById('gallery-selector');
    const galleryContent = document.getElementById('gallery-content');
    
    if (backButton) {
        backButton.addEventListener('click', () => {
            galleryContent.style.display = 'none';
            gallerySelector.style.display = 'grid';
        });
    }
};

// MODAL
const modal = document.getElementById('modal');
const modalImg = document.getElementById('modal-img');
const modalClose = document.getElementById('modal-close');
const likeBtn = document.getElementById('like-btn');
const likeCount = document.getElementById('like-count');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');

const openModal = (imageUrl, index) => {
    currentModalImageUrl = imageUrl;
    currentModalImageIndex = index;
    
    if (modal && modalImg) {
        modalImg.src = imageUrl;
        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        
        updateLikeButton();
    }
};

const closeModal = () => {
    if (modal) {
        modal.setAttribute('hidden', '');
        document.body.style.overflow = 'auto';
        currentModalImageUrl = null;
        currentModalImageIndex = -1;
    }
};

const navigateModal = (direction) => {
    if (currentGalleryImages.length === 0) return;
    
    if (direction === 'prev') {
        currentModalImageIndex = (currentModalImageIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    } else {
        currentModalImageIndex = (currentModalImageIndex + 1) % currentGalleryImages.length;
    }
    
    const imageData = currentGalleryImages[currentModalImageIndex];
    currentModalImageUrl = imageData.url;
    
    if (modalImg) {
        modalImg.src = imageData.url;
    }
    
    updateLikeButton();
};

const updateLikeButton = () => {
    if (!likeBtn || !likeCount || !currentModalImageUrl) return;
    
    const docId = getDocIdFromUrl(currentModalImageUrl);
    const likes = likesCache[docId] || 0;
    const liked = hasLiked();
    
    likeCount.textContent = likes;
    
    const heart = likeBtn.querySelector('.heart');
    if (heart) {
        heart.textContent = liked ? '♥' : '♡';
        likeBtn.classList.toggle('liked', liked);
    }
};

const hasLiked = () => {
    const likedImages = JSON.parse(localStorage.getItem('likedImages') || '[]');
    return likedImages.includes(currentModalImageUrl);
};

const markAsLiked = (url) => {
    const likedImages = JSON.parse(localStorage.getItem('likedImages') || '[]');
    likedImages.push(url);
    localStorage.setItem('likedImages', JSON.stringify(likedImages));
};

const unmarkAsLiked = (url) => {
    const likedImages = JSON.parse(localStorage.getItem('likedImages') || '[]');
    const filtered = likedImages.filter(img => img !== url);
    localStorage.setItem('likedImages', JSON.stringify(filtered));
};

const toggleLike = async () => {
    if (isProcessing || !currentModalImageUrl) return;
    if (!window.FUNCTIONAL_COOKIES_ENABLED) {
        alert('Please accept functional cookies to use the like feature.');
        return;
    }
    
    try {
        isProcessing = true;
        likeBtn.disabled = true;
        
        const isCurrentlyLiked = hasLiked();
        const increment_value = isCurrentlyLiked ? -1 : 1;
        const newLikes = await updateLike(currentModalImageUrl, increment_value);
        
        if (newLikes !== null) {
            if (isCurrentlyLiked) {
                unmarkAsLiked(currentModalImageUrl);
            } else {
                markAsLiked(currentModalImageUrl);
            }
            
            updateLikeButton();
            
            // Re-sort and re-render gallery
            const images = await loadGalleryData(currentGallery);
            galleryImageData[currentGallery] = images;
            currentGalleryImages = images;
            renderMasonryGrid(images);
            
            // Update count in selector
            const countElement = document.getElementById(`${currentGallery}-count`);
            if (countElement) {
                countElement.textContent = `${images.length} images`;
            }
        }
    } catch (error) {
        console.error('Error toggling like:', error);
    } finally {
        isProcessing = false;
        likeBtn.disabled = false;
    }
};

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

// COOKIES - GDPR COMPLIANT
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
    console.log('🍪 Applying cookie preferences:', prefs);
    
    if (prefs.functional) {
        console.log('✅ Functional cookies enabled - loading Firebase');
        window.FUNCTIONAL_COOKIES_ENABLED = true;
        
        try {
            // ✅ GDPR FIX: Load Firebase SDK and initialize ONLY after consent
            await initFirebase();
            await fetchAllLikes();
            console.log('✅ Firebase fully operational');
        } catch (error) {
            console.error('❌ Failed to initialize Firebase:', error);
            window.FUNCTIONAL_COOKIES_ENABLED = false;
        }
    } else {
        console.log('⛔ Functional cookies disabled');
        // ✅ GDPR FIX: Tear down Firebase on consent withdrawal
        teardownFirebase();
        window.FUNCTIONAL_COOKIES_ENABLED = false;
    }
};

// Initialize cookie event listeners
document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookie-banner');
    const cookieSettingsModal = document.getElementById('cookie-settings-modal');
    const cookieAcceptBtn = document.getElementById('cookie-accept-btn');
    const cookieRejectBtn = document.getElementById('cookie-reject-btn');
    const cookieSettingsBtn = document.getElementById('cookie-settings-btn');
    const cookieSaveBtn = document.getElementById('cookie-save-btn');
    const cookieAcceptAllBtn = document.getElementById('cookie-accept-all-btn');
    const cookieRejectAllBtn = document.getElementById('cookie-reject-all-btn');
    const cookieFloatBtn = document.getElementById('cookie-float-btn');
    const cookieModalClose = document.getElementById('cookie-modal-close');
    
    if (cookieAcceptBtn) {
        cookieAcceptBtn.addEventListener('click', async () => {
            const prefs = {
                essential: true,
                functional: true,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            if (cookieBanner) cookieBanner.setAttribute('hidden', '');
            await applyCookiePreferences(prefs);
            location.reload();
        });
    }
    
    if (cookieRejectBtn) {
        cookieRejectBtn.addEventListener('click', () => {
            const prefs = {
                essential: true,
                functional: false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            
            // ✅ GDPR FIX: Tear down Firebase immediately
            teardownFirebase();
            
            if (cookieBanner) cookieBanner.setAttribute('hidden', '');
            location.reload();
        });
    }
    
    if (cookieSettingsBtn && cookieSettingsModal) {
        cookieSettingsBtn.addEventListener('click', () => {
            if (cookieBanner) cookieBanner.setAttribute('hidden', '');
            cookieSettingsModal.removeAttribute('hidden');
        });
    }
    
    if (cookieFloatBtn && cookieSettingsModal) {
        cookieFloatBtn.addEventListener('click', () => {
            const savedPrefs = localStorage.getItem('cookiePreferences');
            if (savedPrefs) {
                const prefs = JSON.parse(savedPrefs);
                const functionalCheckbox = document.getElementById('functional-cookies');
                if (functionalCheckbox) functionalCheckbox.checked = prefs.functional || false;
            }
            cookieSettingsModal.removeAttribute('hidden');
        });
    }
    
    if (cookieModalClose && cookieSettingsModal) {
        cookieModalClose.addEventListener('click', () => {
            cookieSettingsModal.setAttribute('hidden', '');
        });
    }
    
    if (cookieSaveBtn && cookieSettingsModal) {
        cookieSaveBtn.addEventListener('click', async () => {
            const functionalCheckbox = document.getElementById('functional-cookies');
            const prefs = {
                essential: true,
                functional: functionalCheckbox?.checked || false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            cookieSettingsModal.setAttribute('hidden', '');
            await applyCookiePreferences(prefs);
            location.reload();
        });
    }
    
    if (cookieAcceptAllBtn && cookieSettingsModal) {
        cookieAcceptAllBtn.addEventListener('click', async () => {
            const prefs = {
                essential: true,
                functional: true,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            cookieSettingsModal.setAttribute('hidden', '');
            await applyCookiePreferences(prefs);
            location.reload();
        });
    }
    
    if (cookieRejectAllBtn && cookieSettingsModal) {
        cookieRejectAllBtn.addEventListener('click', () => {
            const prefs = {
                essential: true,
                functional: false,
                version: '1.0',
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('cookiePreferences', JSON.stringify(prefs));
            
            // ✅ GDPR FIX: Tear down Firebase immediately
            teardownFirebase();
            
            cookieSettingsModal.setAttribute('hidden', '');
            location.reload();
        });
    }
});

// TERMS MODAL
const termsModal = document.getElementById('terms-modal');
const termsLink = document.getElementById('terms-link');
const termsModalClose = document.getElementById('terms-modal-close');

if (termsLink && termsModal) {
    termsLink.addEventListener('click', () => {
        termsModal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
    });
}

if (termsModalClose && termsModal) {
    termsModalClose.addEventListener('click', () => {
        termsModal.setAttribute('hidden', '');
        document.body.style.overflow = 'auto';
    });
}

if (termsModal) {
    termsModal.addEventListener('click', (e) => {
        if (e.target === termsModal) {
            termsModal.setAttribute('hidden', '');
            document.body.style.overflow = 'auto';
        }
    });
}


// INIT - FIXED ORDER OF OPERATIONS
const init = async () => {
    try {
        console.log('🚀 Initializing The Nonconformist...');
        
        // 1. Initialize cookie preferences FIRST
        initCookieBanner();
        
        // 2. Load image manifest
        await loadManifest();
        
        // 3. If functional cookies are enabled, initialize Firebase and fetch likes BEFORE gallery setup
        if (window.FUNCTIONAL_COOKIES_ENABLED) {
            console.log('🔐 Functional cookies enabled, initializing Firebase...');
            await initFirebase();
            await fetchAllLikes();
        } else {
            console.log('🔐 Functional cookies not enabled, using default likes (0)');
        }
        
        // 4. Setup gallery selector with proper likes data
        await setupGallerySelector();
        
        // 5. Setup navigation
        setupCanvasNavigation();
        setupBackButton();
        
        console.log('✅ Initialization complete');
    } catch (error) {
        console.error('❌ Init error:', error);
    }
};

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}