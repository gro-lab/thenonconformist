// js/modules/firebase.js
// Firebase module - dynamically loaded only after user consent
import { store } from '../lib/store.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';
import { bus } from '../lib/event-bus.js';

let firebaseModules = null;
let app = null;
let db = null;

// Dynamic Firebase loader - only called after consent
const loadFirebaseSDK = async () => {
  if (firebaseModules) return firebaseModules;

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

const firebaseConfig = {
  apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
  authDomain: "thenonconformistdotxyz.firebaseapp.com",
  projectId: "thenonconformistdotxyz",
  storageBucket: "thenonconformistdotxyz.firebasestorage.app",
  messagingSenderId: "552037212425",
  appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8"
};

export const initFirebase = withErrorHandling(async () => {
  // If already initialized or functional cookies disabled, return
  if (app) return;
  if (!store.get('functionalCookiesEnabled')) {
    console.log('⏸️ Firebase not initialized: functional cookies disabled');
    return;
  }

  const firebase = await loadFirebaseSDK();
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.getFirestore(app);
  
  store.set('firebaseApp', app);
  store.set('firebaseDb', db);
  store.set('firebaseModules', firebaseModules);
  
  console.log('✅ Firebase initialized');
  
  // Fetch all likes after init
  await fetchAllLikes();
}, { module: 'firebase' });

export const teardownFirebase = () => {
  if (app) {
    console.log('🔥 Disconnecting Firebase...');
    app = null;
    db = null;
    firebaseModules = null;
    store.set('firebaseApp', null);
    store.set('firebaseDb', null);
    store.set('firebaseModules', null);
    store.set('likesCache', {});
    console.log('✅ Firebase disconnected and cleaned up');
  }
};

// Helper: generate document ID from URL (base64-like but safe)
const getDocIdFromUrl = (url) => {
  return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
};

export const fetchAllLikes = withErrorHandling(async () => {
  if (!store.get('functionalCookiesEnabled') || !db || !firebaseModules) {
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
  store.set('likesCache', likes);
  console.log(`❤️ Loaded ${Object.keys(likes).length} likes from Firestore`);
  return likes;
}, { module: 'firebase' });

export const updateLike = withErrorHandling(async (url, increment_value) => {
  if (!store.get('functionalCookiesEnabled') || !db || !firebaseModules) {
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
    // Update cache
    const currentCache = store.get('likesCache') || {};
    currentCache[docId] = newLikes;
    store.set('likesCache', currentCache);
    return newLikes;
  } else {
    const initialLikes = Math.max(0, increment_value);
    await firebase.setDoc(docRef, {
      url: url,
      likes: initialLikes,
      createdAt: firebase.serverTimestamp(),
      lastUpdated: firebase.serverTimestamp()
    });
    const currentCache = store.get('likesCache') || {};
    currentCache[docId] = initialLikes;
    store.set('likesCache', currentCache);
    return initialLikes;
  }
}, { module: 'firebase' });

// Subscribe to consent changes to (re)init or teardown
bus.on('consent:updated', (prefs) => {
  if (prefs.functional) {
    initFirebase();
  } else {
    teardownFirebase();
  }
});