// THE NONCONFORMIST - GDPR Compliant Version with Thumbnail Support
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
        return firebaseModules;
    }
    
    console.log('📦 Loading Firebase SDK dynamically...');
    
    try {
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

const initFirebase = async () => {
    if (app) return;
    
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

// Thumbnail view state
let thumbnailCache = {};
let thumbnailScrollHandler = null;

window.FUNCTIONAL_COOKIES_ENABLED = false;

// STABLE SORT BY LIKES - DESCENDING ORDER
const stableSortByLikes = (items) => {
    return [...items].sort((a, b) => {
        if (b.likes !== a.likes) return b.likes - a.likes;
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

// ============================================
// 🆕 UPDATED: createImageUrl with thumbnail support
// ============================================
const createImageUrl = (dir, imageData, thumbnail = false) => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    const filename = imageData.originalName || `${dir}-${imageData.index}.${imageData.ext}`;
    
    // Use thumbnails folder for thumbnails, regular folder for full-size
    const path = thumbnail ? `thumbnails/${dir}` : dir;
    
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${path}/${filename}`;
};

const getDocIdFromUrl = (url) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

// FIRESTORE - GDPR COMPLIANT
const fetchAllLikes = async () => {
    try {
        if (!window.FUNCTIONAL_COOKIES_ENABLED || !db || !firebaseModules) {
            console.log('⚠️ Functional cookies not enabled or Firebase not initialized, skipping likes fetch');
            return {};
        }
        
        console.log('📊 Fetching all likes from Firestore...');
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
        if (!window.FUNCTIONAL_COOKIES_ENABLED || !db || !firebaseModules) {
            console.log('⚠️ Functional cookies not enabled, cannot update likes');
            return null;
        }
        
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
        // Store both thumbnail and full-size URLs
        const thumbnailUrl = createImageUrl(dir, imageData, true);  // 🆕 Thumbnail
        const fullSizeUrl = createImageUrl(dir, imageData, false);  // 🆕 Full-size
        const docId = getDocIdFromUrl(fullSizeUrl);
        const likes = likesCache[docId] !== undefined ? likesCache[docId] : 0;
        
        console.log(`📷 ${galleryKey} image ${imageData.index}: ${likes} likes`);
        
        return {
            thumbnailUrl,    // 🆕 Add thumbnail URL
            fullSizeUrl,     // 🆕 Add full-size URL
            url: fullSizeUrl, // Keep for compatibility (likes system uses this)
            likes,
            originalIndex,
            gallery: galleryKey,
            title: gallery.title,
            alt: `${gallery.title} - Image ${imageData.index}`,
            aspectRatio: imageData.aspectDecimal || 
                        (imageData.width && imageData.height ? 
                         imageData.width / imageData.height : 
                         (imageData.orientation === 'vertical' ? 9/16 : 16/9)),
            imageData: imageData
        };
    });
    
    galleryImageData[galleryKey] = images;
    return images;
};

const getMostLikedImageUrl = (galleryKey) => {
    const images = galleryImageData[galleryKey];
    if (!images || images.length === 0) return '';
    
    const sorted = stableSortByLikes(images);
    return sorted[0].thumbnailUrl;  // 🆕 Use thumbnail for gallery covers
};

// Calculate scroll limits based on grid size
const calculateScrollLimits = () => {
    const grid = document.getElementById('masonry-grid');
    const canvas = document.getElementById('infinite-canvas');
    const viewport = document.getElementById('gallery-content');
    
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
    
    scrollLimits = {
        minX: -scrollableWidth,
        maxX: scrollableWidth,
        minY: -scrollableHeight,
        maxY: scrollableHeight
    };
    
    console.log('📐 Scroll limits calculated:', scrollLimits);
};

// GALLERY SELECTOR
const setupGallerySelector = async () => {
    console.log('🔄 Setting up gallery selector...');
    
    await Promise.all(Object.keys(galleries).map(key => loadGalleryData(key)));
    
    Object.keys(galleries).forEach(key => {
        const cover = document.querySelector(`.gallery-cover[data-gallery="${key}"]`);
        const countElement = document.getElementById(`${key}-count`);
        
        if (cover && galleryImageData[key]) {
            const mostLikedUrl = getMostLikedImageUrl(key);
            if (mostLikedUrl) {
                cover.style.backgroundImage = `url(${mostLikedUrl})`;  // 🆕 Uses thumbnail
            }
        }
        
        if (countElement && galleryImageData[key]) {
            const count = galleryImageData[key].length;
            countElement.textContent = `${count} Works`;
        }
    });
    
    document.querySelectorAll('.gallery-cover').forEach(cover => {
        cover.addEventListener('click', function() {
            const galleryId = this.dataset.gallery;
            openGallery(galleryId);
        });
    });
    
    console.log('✅ Gallery selector setup complete');
};

const openGallery = (galleryId) => {
    currentGallery = galleryId;
    
    const gallerySelector = document.getElementById('gallery-selector');
    const loadingIndicator = document.getElementById('loading-indicator');
    const galleryContent = document.getElementById('gallery-content');
    const currentGalleryTitle = document.getElementById('current-gallery-title');
    const currentGallerySubtitle = document.getElementById('current-gallery-subtitle');
    const siteIntro = document.querySelector('.site-intro');
    const termsFooter = document.querySelector('.terms-footer');
    
    loadingIndicator.classList.add('active');
    gallerySelector.classList.add('hidden');
    if (siteIntro) siteIntro.classList.add('hidden');
    if (termsFooter) termsFooter.classList.add('hidden');
    
    currentGalleryTitle.textContent = galleries[galleryId].title;
    currentGallerySubtitle.textContent = galleries[galleryId].subtitle;
    
    setTimeout(() => {
        loadGalleryContent(galleryId);
        loadingIndicator.classList.remove('active');
        galleryContent.classList.add('active');
    }, 800);
};

// ============================================
// 🆕 UPDATED: loadGalleryContent uses thumbnails
// ============================================
const loadGalleryContent = (galleryId) => {
    const masonryGrid = document.getElementById('masonry-grid');
    const gallery = galleries[galleryId];
    const images = galleryImageData[galleryId];
    
    if (!images || images.length === 0) {
        console.error(`No images found for gallery: ${galleryId}`);
        return;
    }
    
    masonryGrid.innerHTML = '';
    
    const sortedImages = stableSortByLikes(images);
    currentGalleryImages = sortedImages;
    
    console.log(`🎨 Rendering ${sortedImages.length} images for ${galleryId}, sorted by likes:`);
    sortedImages.forEach((image, idx) => {
        console.log(`  ${idx + 1}: ${image.likes} likes - ${image.url}`);
    });
    
    sortedImages.forEach((image, index) => {
        const masonryItem = document.createElement('div');
        
        let orientation = 'square';
        if (image.aspectRatio > 1.2) {
            orientation = 'horizontal';
        } else if (image.aspectRatio < 0.8) {
            orientation = 'vertical';
        }
        
        masonryItem.className = `masonry-item ${orientation}`;
        masonryItem.style.animationDelay = `${index * 0.05}s`;
        
        // 🆕 USE THUMBNAIL for background image
        masonryItem.style.backgroundImage = `url(${image.thumbnailUrl})`;
        
        const overlay = document.createElement('div');
        overlay.className = 'item-overlay';
        overlay.style.opacity = '0';
        
        masonryItem.addEventListener('mouseenter', () => {
            overlay.style.opacity = '1';
        });
        
        masonryItem.addEventListener('mouseleave', () => {
            overlay.style.opacity = '0';
        });
        
        overlay.innerHTML = `
            <div class="item-category">${gallery.title}</div>
            <div class="item-title">Image ${image.imageData.index}</div>
            <div class="item-likes">♥ ${image.likes}</div>
        `;
        
        // 🆕 Pass index to modal, which will load full-size image
        masonryItem.addEventListener('click', () => {
            openModal(image.fullSizeUrl, gallery.title, galleryId, index);
        });
        
        masonryItem.appendChild(overlay);
        masonryGrid.appendChild(masonryItem);
    });
    
    scrollX = 0;
    scrollY = 0;
    
    setTimeout(() => {
        calculateScrollLimits();
        updateCanvasTransform();
    }, 100);
    
    setTimeout(calculateScrollLimits, 500);
};

const closeGallery = () => {
    const galleryContent = document.getElementById('gallery-content');
    const gallerySelector = document.getElementById('gallery-selector');
    const siteIntro = document.querySelector('.site-intro');
    const termsFooter = document.querySelector('.terms-footer');
    
    galleryContent.classList.remove('active');
    
    setTimeout(() => {
        gallerySelector.classList.remove('hidden');
        if (siteIntro) siteIntro.classList.remove('hidden');
        if (termsFooter) termsFooter.classList.remove('hidden');
        currentGallery = null;
    }, 800);
};

// ============================================
// THUMBNAIL VIEW FUNCTIONS
// ============================================

const createThumbnailUrl = (fullUrl) => {
    // Use the same URL as full-size for now
    // Can be optimized later with actual thumbnail folder
    return fullUrl;
};

const openThumbnailView = () => {
    const thumbnailOverlay = document.getElementById('thumbnail-overlay');
    const thumbnailGrid = document.getElementById('thumbnail-grid');
    const thumbnailTitle = document.getElementById('thumbnail-overlay-title');
    
    if (!thumbnailOverlay || !thumbnailGrid) return;
    
    // Set title
    const gallery = galleries[currentGallery];
    thumbnailTitle.textContent = `${gallery.title} - Gallery Overview`;
    
    // Clear existing thumbnails
    thumbnailGrid.innerHTML = '';
    
    // Generate thumbnails
    const images = currentGalleryImages;
    images.forEach((image, index) => {
        const thumbnailItem = document.createElement('div');
        
        // Determine aspect ratio class
        let aspectClass = 'square';
        if (image.aspectRatio > 1.2) {
            aspectClass = 'horizontal';
        } else if (image.aspectRatio < 0.8) {
            aspectClass = 'vertical';
        }
        
        thumbnailItem.className = `thumbnail-grid-item ${aspectClass}`;
        thumbnailItem.style.animationDelay = `${index * 0.01}s`;
        
        // Check if thumbnail is in cache
        const thumbnailUrl = thumbnailCache[image.url] || createThumbnailUrl(image.url);
        thumbnailCache[image.url] = thumbnailUrl;
        
        thumbnailItem.style.backgroundImage = `url(${thumbnailUrl})`;
        thumbnailItem.dataset.index = index;
        
        // Add overlay with image number
        const itemOverlay = document.createElement('div');
        itemOverlay.className = 'thumbnail-grid-item-overlay';
        itemOverlay.innerHTML = `<span class="thumbnail-grid-item-number">${image.imageData.index}</span>`;
        
        thumbnailItem.appendChild(itemOverlay);
        
        // Click to jump to image
        thumbnailItem.addEventListener('click', () => {
            jumpToImageFromThumbnail(index);
        });
        
        thumbnailGrid.appendChild(thumbnailItem);
    });
    
    // Show overlay
    thumbnailOverlay.removeAttribute('hidden');
    
    // Setup scroll handler for viewport indicator
    const thumbnailContainer = document.querySelector('.thumbnail-grid-container');
    if (thumbnailContainer) {
        // Remove old handler if exists
        if (thumbnailScrollHandler) {
            thumbnailContainer.removeEventListener('scroll', thumbnailScrollHandler);
        }
        
        // Create new handler
        thumbnailScrollHandler = () => {
            updateViewportIndicator();
            updateThumbnailPosition();
        };
        
        thumbnailContainer.addEventListener('scroll', thumbnailScrollHandler);
        
        // Initial update
        setTimeout(() => {
            updateViewportIndicator();
            updateThumbnailPosition();
        }, 100);
    }
};

const closeThumbnailView = () => {
    const thumbnailOverlay = document.getElementById('thumbnail-overlay');
    const thumbnailContainer = document.querySelector('.thumbnail-grid-container');
    
    if (thumbnailOverlay) {
        thumbnailOverlay.setAttribute('hidden', '');
    }
    
    // Remove scroll handler
    if (thumbnailContainer && thumbnailScrollHandler) {
        thumbnailContainer.removeEventListener('scroll', thumbnailScrollHandler);
        thumbnailScrollHandler = null;
    }
};

const jumpToImageFromThumbnail = (index) => {
    closeThumbnailView();
    
    // Open the image in modal
    if (currentGalleryImages[index]) {
        const image = currentGalleryImages[index];
        openModal(image.url, galleries[currentGallery].title, currentGallery, index);
    }
};

const updateViewportIndicator = () => {
    const indicator = document.getElementById('viewport-indicator');
    const thumbnailContainer = document.querySelector('.thumbnail-grid-container');
    const thumbnailGrid = document.getElementById('thumbnail-grid');
    
    if (!indicator || !thumbnailContainer || !thumbnailGrid) return;
    
    // Get grid dimensions
    const gridRect = thumbnailGrid.getBoundingClientRect();
    const containerRect = thumbnailContainer.getBoundingClientRect();
    
    // Get grid styles to find column count and gap
    const gridStyles = window.getComputedStyle(thumbnailGrid);
    const gap = parseInt(gridStyles.gap) || 8;
    const columnsCount = gridStyles.gridTemplateColumns.split(' ').length;
    
    // Calculate average thumbnail height (accounting for different aspect ratios)
    const thumbnails = thumbnailGrid.querySelectorAll('.thumbnail-grid-item');
    if (thumbnails.length === 0) return;
    
    // Calculate row heights by going through the grid
    // Horizontal thumbnails span 3 columns, so we need to track column position
    let rowHeights = [];
    let currentRow = [];
    let currentColumn = 0;
    
    thumbnails.forEach((thumb) => {
        const isHorizontal = thumb.classList.contains('horizontal');
        const columnSpan = isHorizontal ? 3 : 1;
        
        // Check if this thumbnail fits in current row
        if (currentColumn + columnSpan > columnsCount) {
            // Start new row
            if (currentRow.length > 0) {
                const maxHeight = Math.max(...currentRow.map(t => t.getBoundingClientRect().height));
                rowHeights.push(maxHeight);
            }
            currentRow = [thumb];
            currentColumn = columnSpan;
        } else {
            currentRow.push(thumb);
            currentColumn += columnSpan;
        }
    });
    
    // Add last row
    if (currentRow.length > 0) {
        const maxHeight = Math.max(...currentRow.map(t => t.getBoundingClientRect().height));
        rowHeights.push(maxHeight);
    }
    
    const totalRows = rowHeights.length;
    const totalGridHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (totalRows - 1) * gap;
    
    // Calculate average row height for visible rows calculation
    const avgRowHeight = rowHeights.length > 0 
        ? rowHeights.reduce((sum, h) => sum + h, 0) / rowHeights.length 
        : 80;
    
    // Calculate how many rows are visible in viewport
    const visibleHeight = containerRect.height - 60; // Account for padding
    const rowsVisible = Math.floor(visibleHeight / (avgRowHeight + gap));
    
    // Calculate indicator dimensions
    const indicatorWidth = gridRect.width; // Same width as grid
    const indicatorHeight = Math.max(60, (rowsVisible / totalRows) * totalGridHeight);
    
    // Calculate vertical position based on scroll
    const scrollTop = thumbnailContainer.scrollTop;
    const scrollHeight = thumbnailContainer.scrollHeight;
    const clientHeight = thumbnailContainer.clientHeight;
    const scrollableHeight = scrollHeight - clientHeight;
    
    // Calculate indicator position relative to grid
    const scrollPercentage = scrollableHeight > 0 ? scrollTop / scrollableHeight : 0;
    const maxIndicatorTop = totalGridHeight - indicatorHeight;
    const indicatorTop = scrollPercentage * maxIndicatorTop;
    
    // Set indicator dimensions and position
    indicator.style.width = `${indicatorWidth}px`;
    indicator.style.height = `${indicatorHeight}px`;
    indicator.style.top = `${indicatorTop}px`;
};

const updateThumbnailPosition = () => {
    const positionElement = document.getElementById('thumbnail-position');
    if (positionElement && currentGalleryImages.length > 0) {
        // Calculate which images are currently visible based on vertical scroll
        const thumbnailContainer = document.querySelector('.thumbnail-grid-container');
        const thumbnailGrid = document.getElementById('thumbnail-grid');
        
        if (thumbnailContainer && thumbnailGrid) {
            const scrollTop = thumbnailContainer.scrollTop;
            const clientHeight = thumbnailContainer.clientHeight;
            const scrollHeight = thumbnailContainer.scrollHeight;
            
            // Calculate visible range based on scroll position
            const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
            const scrollEndPercentage = scrollHeight > 0 ? (scrollTop + clientHeight) / scrollHeight : 1;
            
            const visibleStart = Math.floor(scrollPercentage * currentGalleryImages.length) + 1;
            const visibleEnd = Math.ceil(scrollEndPercentage * currentGalleryImages.length);
            
            positionElement.textContent = `${visibleStart}-${Math.min(visibleEnd, currentGalleryImages.length)} / ${currentGalleryImages.length}`;
        }
    }
};

// Setup thumbnail view button and handlers
const setupThumbnailView = () => {
    const thumbnailViewBtn = document.getElementById('thumbnail-view-btn');
    const thumbnailCloseBtn = document.getElementById('thumbnail-close-btn');
    const thumbnailOverlay = document.getElementById('thumbnail-overlay');
    
    if (thumbnailViewBtn) {
        thumbnailViewBtn.addEventListener('click', openThumbnailView);
    }
    
    if (thumbnailCloseBtn) {
        thumbnailCloseBtn.addEventListener('click', closeThumbnailView);
    }
    
    // Close on overlay click (not on grid)
    if (thumbnailOverlay) {
        thumbnailOverlay.addEventListener('click', (e) => {
            if (e.target === thumbnailOverlay) {
                closeThumbnailView();
            }
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const thumbnailOverlay = document.getElementById('thumbnail-overlay');
        if (thumbnailOverlay && !thumbnailOverlay.hasAttribute('hidden')) {
            if (e.key === 'Escape') {
                closeThumbnailView();
            }
        }
    });
};

// CANVAS NAVIGATION
const updateCanvasTransform = () => {
    const container = document.getElementById('canvas-transform-container');
    if (container) {
        container.style.transform = `translate(${scrollX}px, ${scrollY}px)`;
    }
};

const setupCanvasNavigation = () => {
    const canvas = document.getElementById('infinite-canvas');
    const galleryContent = document.getElementById('gallery-content');
    
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
        }
    }
    
    function onDrag(e) {
        if (!isDragging || !galleryContent.classList.contains('active')) return;
        
        scrollX = e.clientX - startX;
        scrollY = e.clientY - startY;
        
        scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
        scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
        
        updateCanvasTransform();
    }
    
    function onDragTouch(e) {
        if (!isDragging || !galleryContent.classList.contains('active')) return;
        if (e.touches.length === 1) {
            scrollX = e.touches[0].clientX - startX;
            scrollY = e.touches[0].clientY - startY;
            
            scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
            scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
            
            updateCanvasTransform();
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
        
        scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
        scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
        
        updateCanvasTransform();
    });
    
    canvas.addEventListener('wheel', function(e) {
        if (!galleryContent.classList.contains('active')) return;
        
        e.preventDefault();
        
        scrollX -= e.deltaX * 0.5;
        scrollY -= e.deltaY * 0.5;
        
        scrollX = Math.max(scrollLimits.minX, Math.min(scrollLimits.maxX, scrollX));
        scrollY = Math.max(scrollLimits.minY, Math.min(scrollLimits.maxY, scrollY));
        
        updateCanvasTransform();
    }, { passive: false });
    
    window.addEventListener('resize', () => {
        if (galleryContent.classList.contains('active')) {
            setTimeout(calculateScrollLimits, 100);
        }
    });
};

const setupBackButton = () => {
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', closeGallery);
    }
};

// ============================================
// 🆕 UPDATED: Modal uses full-size images
// ============================================
const modal = document.getElementById('modal');
const modalImage = document.getElementById('modal-img');
const likeBtn = document.getElementById('like-btn');
const modalClose = document.getElementById('modal-close');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');

const openModal = (fullSizeImageUrl, category = 'Image', galleryKey = currentGallery, imageIndex = 0) => {
    currentModalImageUrl = fullSizeImageUrl;  // 🆕 This is now full-size URL
    currentModalImageIndex = imageIndex;
    
    // 🆕 Load full-size image in modal
    modalImage.src = fullSizeImageUrl;
    
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
    currentModalImageUrl = nextImage.fullSizeUrl;  // 🆕 Use full-size URL
    modalImage.src = nextImage.fullSizeUrl;        // 🆕 Load full-size image
    
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
            if (isCurrentlyLiked) {
                localStorage.removeItem(likedKey);
            } else {
                localStorage.setItem(likedKey, 'true');
            }
            
            likesCache[docId] = newLikes;
            
            Object.keys(galleryImageData).forEach(galleryKey => {
                const images = galleryImageData[galleryKey];
                const imageIndex = images.findIndex(img => img.fullSizeUrl === currentModalImageUrl);  // 🆕 Compare full-size URLs
                if (imageIndex !== -1) {
                    images[imageIndex].likes = newLikes;
                }
            });
            
            updateLikeButton();
            loadGalleryContent(currentGallery);
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
        window.FUNCTIONAL_COOKIES_ENABLED = true;
        await initFirebase();
        await fetchAllLikes();
    } else {
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

// INIT
const init = async () => {
    try {
        console.log('🚀 Initializing The Nonconformist...');
        
        initCookieBanner();
        await loadManifest();
        
        if (window.FUNCTIONAL_COOKIES_ENABLED) {
            console.log('🔓 Functional cookies enabled, initializing Firebase...');
            await initFirebase();
            await fetchAllLikes();
        } else {
            console.log('🔒 Functional cookies not enabled, using default likes (0)');
        }
        
        await setupGallerySelector();
        setupCanvasNavigation();
        setupBackButton();
        setupThumbnailView();
        
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