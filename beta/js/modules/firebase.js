// ============================================
// FIREBASE MODULE — Dynamic SDK + Firestore CRUD
// ✅ GDPR: SDK loaded ONLY after user consent
// ============================================

import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';

let firebaseModules = null;
let app = null;
let db = null;

// ── Dynamic Firebase loader ──────────────────

const loadFirebaseSDK = async () => {
  if (firebaseModules) return firebaseModules;

  console.log('📦 Loading Firebase SDK dynamically...');

  try {
    const [appModule, firestoreModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js'),
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
      serverTimestamp: firestoreModule.serverTimestamp,
    };

    console.log('✅ Firebase SDK loaded successfully');
    return firebaseModules;
  } catch (error) {
    console.error('❌ Failed to load Firebase SDK:', error);
    throw error;
  }
};

// ── Init / Teardown ──────────────────────────

export const initFirebase = async () => {
  if (app) return;

  const firebase = await loadFirebaseSDK();

  const firebaseConfig = {
    apiKey: 'AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8',
    authDomain: 'thenonconformistdotxyz.firebaseapp.com',
    projectId: 'thenonconformistdotxyz',
    storageBucket: 'thenonconformistdotxyz.firebasestorage.app',
    messagingSenderId: '552037212425',
    appId: '1:552037212425:web:b0ddaed6ebbc34442f73d8',
  };

  app = firebase.initializeApp(firebaseConfig);
  db = firebase.getFirestore(app);
  console.log('✅ Firebase initialized');
};

export const teardownFirebase = () => {
  if (app) {
    console.log('🔥 Disconnecting Firebase...');
    app = null;
    db = null;
    firebaseModules = null;
    store.set('likesCache', {});
    store.set('functionalCookiesEnabled', false);
    console.log('✅ Firebase disconnected and cleaned up');
  }
};

// ── Firestore helpers ────────────────────────

const createDocId = (url) => btoa(url).replace(/[/+=]/g, '_');

export const fetchAllLikes = async () => {
  if (!db || !firebaseModules) return {};

  try {
    const { collection, getDocs } = firebaseModules;
    const snapshot = await getDocs(collection(db, 'image_likes'));
    const likes = {};
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.url) {
        likes[data.url] = data.likes || 0;
      }
    });
    store.set('likesCache', likes);
    console.log(`📊 Fetched likes for ${Object.keys(likes).length} images`);
    return likes;
  } catch (error) {
    console.error('❌ Error fetching likes:', error);
    return {};
  }
};

export const toggleLike = async (imageUrl) => {
  if (!db || !firebaseModules || store.get('isProcessing')) return null;
  store.set('isProcessing', true);

  try {
    const { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } =
      firebaseModules;

    const docId = createDocId(imageUrl);
    const docRef = doc(db, 'image_likes', docId);
    const likedImages = JSON.parse(localStorage.getItem('likedImages') || '{}');
    const isCurrentlyLiked = likedImages[imageUrl];

    const docSnap = await getDoc(docRef);

    if (isCurrentlyLiked) {
      // Unlike
      if (docSnap.exists()) {
        const currentLikes = docSnap.data().likes || 0;
        await updateDoc(docRef, {
          likes: Math.max(0, currentLikes - 1),
          lastUpdated: serverTimestamp(),
        });
      }
      delete likedImages[imageUrl];
    } else {
      // Like
      if (docSnap.exists()) {
        await updateDoc(docRef, {
          likes: increment(1),
          lastUpdated: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          url: imageUrl,
          likes: 1,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
      }
      likedImages[imageUrl] = true;
    }

    localStorage.setItem('likedImages', JSON.stringify(likedImages));

    // Refresh likes cache
    const updatedSnap = await getDoc(docRef);
    const newCount = updatedSnap.exists() ? updatedSnap.data().likes || 0 : 0;
    const cache = { ...store.get('likesCache') };
    cache[imageUrl] = newCount;
    store.set('likesCache', cache);

    // Emit events for UI updates
    bus.emit('likes:updated', { url: imageUrl, count: newCount, isLiked: !isCurrentlyLiked });
    bus.emit('gallery:covers:refresh');

    return { count: newCount, isLiked: !isCurrentlyLiked };
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    return null;
  } finally {
    store.set('isProcessing', false);
  }
};

export const getLikeCount = async (imageUrl) => {
  const cached = store.get('likesCache')[imageUrl];
  if (cached !== undefined) return cached;

  if (!db || !firebaseModules) return 0;

  try {
    const { doc, getDoc } = firebaseModules;
    const docRef = doc(db, 'image_likes', createDocId(imageUrl));
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data().likes || 0 : 0;
  } catch {
    return 0;
  }
};

export const isImageLiked = (imageUrl) => {
  const likedImages = JSON.parse(localStorage.getItem('likedImages') || '{}');
  return !!likedImages[imageUrl];
};