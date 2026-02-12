// ============================================
// FIREBASE MODULE — Dynamic SDK loading + Firestore likes
// SDK loaded ONLY after GDPR consent
// ============================================

import { store } from './store.js';
import { bus } from './event-bus.js';

const FIREBASE_VERSION = '12.8.0';
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8',
  authDomain: 'thenonconformistdotxyz.firebaseapp.com',
  projectId: 'thenonconformistdotxyz',
  storageBucket: 'thenonconformistdotxyz.firebasestorage.app',
  messagingSenderId: '552037212425',
  appId: '1:552037212425:web:b0ddaed6ebbc34442f73d8',
};

// ── Helpers ──────────────────────────────────

/** Encode a URL into a safe Firestore document ID. */
export function getDocIdFromUrl(url) {
  return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
}

// ── SDK Loading ──────────────────────────────

async function loadFirebaseSDK() {
  if (store.get('firebaseModules')) return store.get('firebaseModules');

  console.log('📦 Loading Firebase SDK dynamically…');

  const [appModule, firestoreModule] = await Promise.all([
    import(`${FIREBASE_CDN}/firebase-app.js`),
    import(`${FIREBASE_CDN}/firebase-firestore.js`),
  ]);

  const modules = {
    initializeApp:   appModule.initializeApp,
    getFirestore:    firestoreModule.getFirestore,
    collection:      firestoreModule.collection,
    doc:             firestoreModule.doc,
    getDoc:          firestoreModule.getDoc,
    setDoc:          firestoreModule.setDoc,
    updateDoc:       firestoreModule.updateDoc,
    increment:       firestoreModule.increment,
    getDocs:         firestoreModule.getDocs,
    serverTimestamp: firestoreModule.serverTimestamp,
  };

  store.set('firebaseModules', modules);
  console.log('✅ Firebase SDK loaded');
  return modules;
}

// ── Init / Teardown ──────────────────────────

export async function initFirebase() {
  if (store.get('firebaseApp')) return;

  const firebase = await loadFirebaseSDK();
  const app = firebase.initializeApp(FIREBASE_CONFIG);
  const db  = firebase.getFirestore(app);

  store.set('firebaseApp', app);
  store.set('firebaseDb', db);
  console.log('✅ Firebase initialized');
}

export function teardownFirebase() {
  if (!store.get('firebaseApp')) return;

  console.log('🔥 Disconnecting Firebase…');
  store.set('firebaseApp', null);
  store.set('firebaseDb', null);
  store.set('firebaseModules', null);
  store.set('likesCache', {});
  store.set('functionalCookiesEnabled', false);
  console.log('✅ Firebase disconnected');
}

// ── Likes CRUD ───────────────────────────────

export async function fetchAllLikes() {
  const db      = store.get('firebaseDb');
  const firebase = store.get('firebaseModules');

  if (!store.get('functionalCookiesEnabled') || !db || !firebase) {
    console.log('⚠️ Skipping likes fetch — Firebase not ready');
    return {};
  }

  console.log('📊 Fetching all likes from Firestore…');
  const snapshot = await firebase.getDocs(firebase.collection(db, 'image_likes'));
  const likes = {};

  snapshot.forEach((doc) => {
    likes[doc.id] = doc.data().likes || 0;
  });

  store.set('likesCache', likes);
  console.log(`❤️ Loaded ${Object.keys(likes).length} likes`);
  return likes;
}

export async function updateLike(url, incrementValue) {
  const db       = store.get('firebaseDb');
  const firebase = store.get('firebaseModules');

  if (!store.get('functionalCookiesEnabled') || !db || !firebase) {
    console.log('⚠️ Cannot update likes — Firebase not ready');
    return null;
  }

  const docId  = getDocIdFromUrl(url);
  const docRef = firebase.doc(db, 'image_likes', docId);
  const snap   = await firebase.getDoc(docRef);

  if (snap.exists()) {
    await firebase.updateDoc(docRef, {
      likes:       firebase.increment(incrementValue),
      lastUpdated: firebase.serverTimestamp(),
    });
    const updated = await firebase.getDoc(docRef);
    const newLikes = updated.data().likes;

    const cache = { ...store.get('likesCache'), [docId]: newLikes };
    store.set('likesCache', cache);
    return newLikes;
  }

  // First like — create document
  const initialLikes = Math.max(0, incrementValue);
  await firebase.setDoc(docRef, {
    url,
    likes:       initialLikes,
    createdAt:   firebase.serverTimestamp(),
    lastUpdated: firebase.serverTimestamp(),
  });

  const cache = { ...store.get('likesCache'), [docId]: initialLikes };
  store.set('likesCache', cache);
  return initialLikes;
}
