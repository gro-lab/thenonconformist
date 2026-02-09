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
        const url = createImageUrl(dir, imageData);
        const docId = getDocIdFromUrl(url);
        const likes = likesCache[docId] !== undefined ? likesCache[docId] : 0;
        
        console.log(`📷 ${galleryKey} image ${imageData.index}: ${likes} likes`);
        
        return {
            url,
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
    return sorted[0].url;
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
                cover.style.backgroundImage = `url(${mostLikedUrl})`;
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
        masonryItem.style.backgroundImage = `url(${image.url})`;
        
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
        
        masonryItem.addEventListener('click', () => {
            openModal(image.url, gallery.title, galleryId, index);
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
// THUMBNAIL VIEW SYSTEM
// ============================================

let thumbnailCache = {};
let thumbnailScrollHandler = null;
let thumbnailResizeHandler = null;

const openThumbnailView = () => {
    if (!currentGalleryImages || currentGalleryImages.length === 0) {
        console.warn('No images in current gallery');
        return;
    }
    
    const overlay = document.getElementById('thumbnail-overlay');
    const thumbnailGrid = document.getElementById('thumbnail-grid');
    const overlayTitle = document.getElementById('thumbnail-overlay-title');
    
    if (!overlay || !thumbnailGrid) return;
    
    // Set title
    const gallery = galleries[currentGallery];
    overlayTitle.textContent = `${gallery.title} - Gallery Overview`;
    
    // Clear existing thumbnails
    thumbnailGrid.innerHTML = '';
    
    // Generate thumbnails
    currentGalleryImages.forEach((image, index) => {
        const thumb = document.createElement('div');
        
        // Determine aspect ratio class
        let aspectClass = 'square';
        if (image.aspectRatio > 1.2) {
            aspectClass = 'horizontal';
        } else if (image.aspectRatio < 0.8) {
            aspectClass = 'vertical';
        }
        
        thumb.className = `thumbnail-grid-item ${aspectClass}`;
        thumb.style.backgroundImage = `url(${image.url})`;
        thumb.style.animationDelay = `${index * 0.02}s`;
        
        // Add overlay with image number
        const itemOverlay = document.createElement('div');
        itemOverlay.className = 'thumbnail-grid-item-overlay';
        itemOverlay.innerHTML = `<span class="thumbnail-grid-item-number">#${image.imageData.index}</span>`;
        
        thumb.appendChild(itemOverlay);
        
        // Click handler
        thumb.addEventListener('click', () => {
            closeThumbnailView();
            setTimeout(() => {
                openModal(image.url, gallery.title, currentGallery, index);
            }, 100);
        });
        
        thumbnailGrid.appendChild(thumb);
    });
    
    // Show overlay
    overlay.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    
    // Setup scroll handler
    const gridContainer = document.querySelector('.thumbnail-grid-container');
    
    // Wait for layout to complete
    setTimeout(() => {
        updateViewportIndicator();
        updateThumbnailPosition();
        
        thumbnailScrollHandler = () => {
            requestAnimationFrame(() => {
                updateViewportIndicator();
                updateThumbnailPosition();
            });
        };
        
        thumbnailResizeHandler = () => {
            requestAnimationFrame(() => {
                updateViewportIndicator();
            });
        };
        
        gridContainer.addEventListener('scroll', thumbnailScrollHandler);
        window.addEventListener('resize', thumbnailResizeHandler);
    }, 100);
};

const closeThumbnailView = () => {
    const overlay = document.getElementById('thumbnail-overlay');
    const gridContainer = document.querySelector('.thumbnail-grid-container');
    
    if (!overlay) return;
    
    // Remove event listeners
    if (thumbnailScrollHandler) {
        gridContainer.removeEventListener('scroll', thumbnailScrollHandler);
        thumbnailScrollHandler = null;
    }
    
    if (thumbnailResizeHandler) {
        window.removeEventListener('resize', thumbnailResizeHandler);
        thumbnailResizeHandler = null;
    }
    
    // Hide overlay
    overlay.setAttribute('hidden', '');
    document.body.style.overflow = 'auto';
};

const updateViewportIndicator = () => {
    const gridContainer = document.querySelector('.thumbnail-grid-container');
    const thumbnailGrid = document.getElementById('thumbnail-grid');
    const indicator = document.getElementById('viewport-indicator');
    
    if (!gridContainer || !thumbnailGrid || !indicator) return;
    
    const gridRect = thumbnailGrid.getBoundingClientRect();
    const containerRect = gridContainer.getBoundingClientRect();
    
    // Calculate visible portion
    const scrollTop = gridContainer.scrollTop;
    const scrollHeight = gridContainer.scrollHeight;
    const clientHeight = gridContainer.clientHeight;
    
    if (scrollHeight <= clientHeight) {
        indicator.style.display = 'none';
        return;
    }
    
    indicator.style.display = 'block';
    
    // Calculate row heights
    const thumbnails = Array.from(thumbnailGrid.children);
    const gridStyle = window.getComputedStyle(thumbnailGrid);
    const gap = parseInt(gridStyle.gap) || 8;
    
    // Get number of columns from computed style
    const columnsCount = gridStyle.gridTemplateColumns.split(' ').length;
    
    let rowHeights = [];
    let currentRow = [];
    let currentColumn = 0;
    
    thumbnails.forEach((thumb) => {
        const isHorizontal = thumb.classList.contains('horizontal');
        const columnSpan = isHorizontal ? Math.min(columnsCount, 2) : 1;
        
        if (currentColumn + columnSpan > columnsCount) {
            // Save current row
            if (currentRow.length > 0) {
                const maxHeight = Math.max(...currentRow.map(t => 
                    t.getBoundingClientRect().height
                ));
                rowHeights.push(maxHeight);
            }
            currentRow = [thumb];
            currentColumn = columnSpan;
        } else {
            currentRow.push(thumb);
            currentColumn += columnSpan;
        }
    });
    
    // Don't forget last row
    if (currentRow.length > 0) {
        const maxHeight = Math.max(...currentRow.map(t => 
            t.getBoundingClientRect().height
        ));
        rowHeights.push(maxHeight);
    }
    
    const totalRows = rowHeights.length;
    if (totalRows === 0) return;
    
    const totalGridHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (gap * (totalRows - 1));
    const avgRowHeight = totalGridHeight / totalRows;
    
    // Calculate visible rows
    const visibleRows = Math.ceil(clientHeight / avgRowHeight);
    const indicatorHeight = Math.min(
        (visibleRows / totalRows) * totalGridHeight,
        totalGridHeight
    );
    
    // Calculate position
    const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
    const indicatorTop = scrollPercentage * (totalGridHeight - indicatorHeight);
    
    // Apply styles
    indicator.style.height = `${indicatorHeight}px`;
    indicator.style.top = `${indicatorTop}px`;
};

const updateThumbnailPosition = () => {
    const gridContainer = document.querySelector('.thumbnail-grid-container');
    const positionElement = document.getElementById('thumbnail-position');
    
    if (!gridContainer || !positionElement || !currentGalleryImages) return;
    
    const scrollTop = gridContainer.scrollTop;
    const scrollHeight = gridContainer.scrollHeight;
    const clientHeight = gridContainer.clientHeight;
    
    const totalImages = currentGalleryImages.length;
    
    if (scrollHeight <= clientHeight) {
        positionElement.textContent = `1-${totalImages} / ${totalImages}`;
        return;
    }
    
    const scrollPercentage = scrollTop / scrollHeight;
    const scrollEndPercentage = (scrollTop + clientHeight) / scrollHeight;
    
    const visibleStart = Math.floor(scrollPercentage * totalImages) + 1;
    const visibleEnd = Math.min(
        Math.ceil(scrollEndPercentage * totalImages),
        totalImages
    );
    
    positionElement.textContent = `${visibleStart}-${visibleEnd} / ${totalImages}`;
};

const setupThumbnailView = () => {
    const thumbnailBtn = document.getElementById('thumbnail-view-btn');
    const thumbnailClose = document.getElementById('thumbnail-close-btn');
    const overlay = document.getElementById('thumbnail-overlay');
    
    if (thumbnailBtn) {
        thumbnailBtn.addEventListener('click', openThumbnailView);
    }
    
    if (thumbnailClose) {
        thumbnailClose.addEventListener('click', closeThumbnailView);
    }
    
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeThumbnailView();
            }
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (!overlay || overlay.hasAttribute('hidden')) return;
        
        if (e.key === 'Escape') {
            closeThumbnailView();
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

// MODAL
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
                const imageIndex = images.findIndex(img => img.url === currentModalImageUrl);
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
            console.log('🔐 Functional cookies enabled, initializing Firebase...');
            await initFirebase();
            await fetchAllLikes();
        } else {
            console.log('🔐 Functional cookies not enabled, using default likes (0)');
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