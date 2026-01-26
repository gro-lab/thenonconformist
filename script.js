// ============================================
// THE NONCONFORMIST - Script with Fallback
// Works with OR without images.json manifest
// ============================================

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// ============================================
// IMAGE MANIFEST
// ============================================
let IMAGE_MANIFEST = null;

// ============================================
// GALLERY CONFIGURATION
// ============================================

const galleries = {
    'low': {
        title: 'Language of Windows',
        dir: 'LoW',
        count: 50
    },
    'sol': {
        title: 'Snapshots of Life',
        dir: 'SoL',
        count: 50
    },
    'r': {
        title: 'Reflections',
        dir: 'R',
        count: 50
    },
    'sa': {
        title: 'Street Art',
        dir: 'SA',
        count: 50
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let likesCache = {};
let currentModalImageUrl = null;
let isProcessing = false;

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

const createImageUrl = (dir, index, extension) => {
    const owner = 'gro-lab';
    const repo = 'thenonconformist';
    const branch = 'main';
    
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/images/${dir}/${dir}-${index}.${extension}`;
};

const getDocIdFromUrl = (url) => {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

// ============================================
// LOAD IMAGE MANIFEST (OPTIONAL)
// ============================================

const loadImageManifest = async () => {
    try {
        const response = await fetch('images.json');
        if (!response.ok) {
            console.warn('⚠️ images.json not found, using fallback mode');
            return null;
        }
        IMAGE_MANIFEST = await response.json();
        console.log('✅ Loaded image manifest');
        return IMAGE_MANIFEST;
    } catch (error) {
        console.warn('⚠️ Could not load manifest, using fallback mode');
        return null;
    }
};

// ============================================
// FALLBACK: Try common extensions
// ============================================

const tryImageExtensions = async (dir, index) => {
    const extensions = ['JPEG', 'JPG', 'jpg', 'jpeg', 'png', 'PNG'];
    
    for (const ext of extensions) {
        const url = createImageUrl(dir, index, ext);
        try {
            const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
            if (response.ok) {
                return { url, ext };
            }
        } catch (e) {
            // Continue to next extension
        }
    }
    return null;
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

// ============================================
// IMAGE GRID GENERATION (WITH FALLBACK)
// ============================================

const generateImageGrid = async (galleryKey) => {
    const gallery = galleries[galleryKey];
    const gridId = `grid-${galleryKey}`;
    const grid = document.getElementById(gridId);
    
    if (!grid) return;
    
    console.log(`📸 Loading ${gallery.title}...`);
    
    let images = [];
    
    // MODE 1: Use manifest if available
    if (IMAGE_MANIFEST && IMAGE_MANIFEST[gallery.dir]) {
        const manifestImages = IMAGE_MANIFEST[gallery.dir];
        images = manifestImages.map(item => ({
            url: createImageUrl(gallery.dir, item.index, item.ext),
            index: item.index
        }));
        console.log(`   Using manifest: ${images.length} images`);
    }
    // MODE 2: Fallback - try all extensions for each index
    else {
        console.log('   Using fallback mode (slower)...');
        const BATCH_SIZE = 5;
        
        for (let i = 1; i <= gallery.count; i += BATCH_SIZE) {
            const batch = [];
            
            for (let j = i; j < Math.min(i + BATCH_SIZE, gallery.count + 1); j++) {
                batch.push(
                    tryImageExtensions(gallery.dir, j)
                        .then(result => result ? { url: result.url, index: j } : null)
                );
            }
            
            const results = await Promise.all(batch);
            images.push(...results.filter(Boolean));
        }
        console.log(`   Found ${images.length} images`);
    }
    
    // Sort by likes
    images.sort((a, b) => {
        const likesA = likesCache[getDocIdFromUrl(a.url)] || 0;
        const likesB = likesCache[getDocIdFromUrl(b.url)] || 0;
        return likesB - likesA;
    });
    
    // Create and append image elements
    images.forEach(({ url }) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = `${gallery.title}`;
        img.dataset.url = url;
        img.loading = 'lazy';
        
        img.addEventListener('error', () => {
            console.warn(`Failed to load: ${url}`);
            img.remove();
        });
        
        img.addEventListener('click', () => openModal(url));
        
        grid.appendChild(img);
    });
    
    console.log(`✅ Loaded ${images.length} images for ${gallery.title}`);
};

// ============================================
// CAROUSEL FUNCTIONALITY
// ============================================

const setupCarousel = () => {
    document.querySelectorAll('.carousel-container').forEach(container => {
        const grid = container.querySelector('.gallery-grid');
        const prevBtn = container.querySelector('.carousel-btn.prev');
        const nextBtn = container.querySelector('.carousel-btn.next');
        
        if (!grid) return;
        
        const itemWidth = grid.offsetWidth;
        
        prevBtn.addEventListener('click', () => {
            grid.scrollBy({ left: -itemWidth, behavior: 'smooth' });
        });
        
        nextBtn.addEventListener('click', () => {
            grid.scrollBy({ left: itemWidth, behavior: 'smooth' });
        });
    });
    
    setupTouchSwipe();
};

const setupTouchSwipe = () => {
    let startX = 0;
    let currentX = 0;
    const threshold = 50;
    
    document.querySelectorAll('.gallery-grid').forEach(grid => {
        grid.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, false);
        
        grid.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX;
        }, false);
        
        grid.addEventListener('touchend', () => {
            const diff = startX - currentX;
            if (Math.abs(diff) > threshold) {
                const distance = diff > 0 ? grid.offsetWidth : -grid.offsetWidth;
                grid.scrollBy({ left: distance, behavior: 'smooth' });
            }
        }, false);
    });
};

// ============================================
// MODAL OPERATIONS
// ============================================

const modal = document.getElementById('modal');
const modalImage = document.getElementById('modal-image');
const likeBtn = document.getElementById('like-btn');
const modalClose = modal.querySelector('.modal-close');

const openModal = (imageUrl) => {
    currentModalImageUrl = imageUrl;
    modalImage.src = imageUrl;
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
    
    count.textContent = likes;
    
    const likedKey = `liked_${docId}`;
    const isLiked = localStorage.getItem(likedKey) === 'true';
    
    if (isLiked) {
        heart.classList.add('liked');
    } else {
        heart.classList.remove('liked');
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

window.addEventListener('resize', debounce(() => {
    setupCarousel();
}, 150));

window.addEventListener('orientationchange', () => {
    setupCarousel();
});

// ============================================
// INITIALIZATION
// ============================================

const init = async () => {
    try {
        console.log('🚀 Initializing The Nonconformist...');
        
        // Try to load manifest (optional)
        await loadImageManifest();
        
        // Fetch likes from Firestore
        await fetchAllLikes();
        console.log('✅ Loaded likes from Firestore');
        
        // Generate grids (with or without manifest)
        for (const key of Object.keys(galleries)) {
            await generateImageGrid(key);
        }
        
        setupCarousel();
        
        console.log('✅ The Nonconformist initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
    }
};

document.addEventListener('DOMContentLoaded', init);