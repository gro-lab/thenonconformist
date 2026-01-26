// ============================================
// THE NONCONFORMIST - Script
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
    query,
    orderBy,
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
        dir: 'LoW',
        count: 50  // Will check which images exist
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

const createImageUrl = (dir, index) => {
    // Load images from GitHub repository
    const owner = 'gro-lab'; // Your GitHub username
    const repo = 'thenonconformist'; // Your repo name
    const branch = 'main'; // Your branch name
    
    // Map of directories to their actual names (handle case-sensitivity)
    const dirMap = {
        'low': 'images/LoW',
        'sol': 'images/SoL',
        'r': 'images/R',
        'sa': 'images/SA'
    };
    
    const actualDir = dirMap[dir] || `images/${dir}`;
    const extensions = ['JPEG', 'JPG', 'jpeg', 'jpg', 'png', 'webp', 'gif'];
    
    return { owner, repo, branch, actualDir, dir, index, extensions };
};

// Helper function to get image URL with extension fallback
const getImageUrlWithFallback = async (imageConfig) => {
    const { owner, repo, branch, actualDir, dir, index, extensions } = imageConfig;
    
    // Try extensions in order
    for (const ext of extensions) {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${actualDir}/${dir}-${index}.${ext}`;
        try {
            const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            if (response.ok || response.status === 200) {
                console.log(`✅ Found: ${url}`);
                return url;
            }
        } catch (e) {
            // Continue to next extension
        }
    }
    
    // If no extension works, return first try (will show error)
    const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${actualDir}/${dir}-${index}.${extensions[0]}`;
    console.warn(`⚠️ Could not verify: ${fallbackUrl}`);
    return fallbackUrl;
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
// IMAGE GRID GENERATION
// ============================================

const generateImageGrid = async (galleryKey) => {
    const gallery = galleries[galleryKey];
    const gridId = `grid-${galleryKey}`;
    const grid = document.getElementById(gridId);
    
    if (!grid) return;
    
    // Create image elements - only add successfully loaded ones
    const images = [];
    
    for (let i = 1; i <= gallery.count; i++) {
        const imageConfig = createImageUrl(gallery.dir, i);
        
        try {
            const url = await getImageUrlWithFallback(imageConfig);
            
            // Verify the URL actually works before creating the image element
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok) {
                console.log(`❌ Skipping ${gallery.dir}-${i}: Not found`);
                continue; // Skip this image
            }
            
            const img = document.createElement('img');
            img.src = url;
            img.alt = `${gallery.title} - Image ${i}`;
            img.dataset.url = url;
            img.loading = 'lazy';
            
            // Add error handling
            img.addEventListener('error', (e) => {
                console.warn(`Failed to load image: ${url}`);
                img.remove(); // Remove broken images from DOM
            });
            
            img.addEventListener('load', () => {
                console.log(`✅ Loaded: ${url}`);
            });
            
            img.addEventListener('click', () => openModal(url));
            
            // Lazy loading with Intersection Observer
            setupLazyLoading(img);
            
            images.push({ element: img, url: url });
            
        } catch (error) {
            console.log(`❌ Skipping ${gallery.dir}-${i}: ${error.message}`);
            continue;
        }
    }
    
    // Sort by likes
    images.sort((a, b) => {
        const likesA = likesCache[getDocIdFromUrl(a.url)] || 0;
        const likesB = likesCache[getDocIdFromUrl(b.url)] || 0;
        return likesB - likesA;
    });
    
    // Append to grid
    images.forEach(({ element }) => {
        grid.appendChild(element);
    });
    
    console.log(`📸 Generated ${images.length} images for ${gallery.title}`);
};

const setupLazyLoading = (img) => {
    const options = {
        rootMargin: '200px',
        threshold: 0.01
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const image = entry.target;
                image.src = image.dataset.src || image.src;
                observer.unobserve(image);
            }
        });
    }, options);
    
    observer.observe(img);
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
    
    // Touch swipe support
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
    
    // Check if user has liked (using localStorage for session)
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

// Handle resize and orientation changes
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
        // Fetch likes from Firestore
        await fetchAllLikes();
        
        // Log a sample URL for debugging
        const sampleConfig = createImageUrl('LoW', 1);
        const sampleUrl = await getImageUrlWithFallback(sampleConfig);
        console.log(`📸 Sample image URL: ${sampleUrl}`);
        
        // Generate grids for all galleries (in parallel)
        await Promise.all(
            Object.keys(galleries).map(key => generateImageGrid(key))
        );
        
        // Setup carousel functionality
        setupCarousel();
        
        console.log('✅ The Nonconformist initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
    }
};

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);