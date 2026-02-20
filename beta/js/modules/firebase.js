// js/modules/firebase.js (fixed like event handling)
// Firebase module - dynamically loaded only after user consent
import { store } from '../lib/store.js';
import { errorHandler, withErrorHandling } from '../lib/error-handler.js';
import { bus } from '../lib/event-bus.js';
import { getDocIdFromUrl } from '../lib/utils.js';

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
      initializeFirestore: firestoreModule.initializeFirestore,
      collection: firestoreModule.collection,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
      updateDoc: firestoreModule.updateDoc,
      increment: firestoreModule.increment,
      getDocs: firestoreModule.getDocs,
      serverTimestamp: firestoreModule.serverTimestamp,
      // bfcache support — close/reopen Firestore's persistent connection
      disableNetwork: firestoreModule.disableNetwork,
      enableNetwork: firestoreModule.enableNetwork,
      terminate: firestoreModule.terminate
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

// ==================== bfcache lifecycle ====================
// Firestore opens a WebSocket that prevents the browser from storing
// the page in the back/forward cache. disableNetwork alone doesn't
// close WebSockets, so we fully terminate the Firestore instance on
// pagehide and reinitialise it when the page is restored from bfcache.
let bfcacheHandlersRegistered = false;

const setupBfcacheHandlers = () => {
  if (bfcacheHandlersRegistered) return;
  bfcacheHandlersRegistered = true;

  window.addEventListener('pagehide', () => {
    if (db && firebaseModules?.terminate) {
      firebaseModules.terminate(db)
        .then(() => console.log('⏸️ Firestore terminated (pagehide)'))
        .catch(() => {}); // swallow — page may already be frozen
      // Null out db so we know to reinit on restore
      db = null;
      store.set('firebaseDb', null);
    }
  });

  window.addEventListener('pageshow', async (e) => {
    // persisted === true means page was restored from bfcache
    if (e.persisted && !db && app && firebaseModules) {
      console.log('▶️ Page restored from bfcache — reinitialising Firestore...');
      db = firebaseModules.getFirestore(app);
      store.set('firebaseDb', db);
      // Refresh likes since they may have changed while page was cached
      await fetchAllLikes();
      console.log('✅ Firestore reconnected after bfcache restore');
    }
  });
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
  
  // Wire up bfcache handlers now that db exists
  setupBfcacheHandlers();
  
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
    // Spread into new object so the Proxy detects the change
    store.set('likesCache', { ...store.get('likesCache'), [docId]: newLikes });
    return newLikes;
  } else {
    const initialLikes = Math.max(0, increment_value);
    await firebase.setDoc(docRef, {
      url: url,
      likes: initialLikes,
      createdAt: firebase.serverTimestamp(),
      lastUpdated: firebase.serverTimestamp()
    });
    store.set('likesCache', { ...store.get('likesCache'), [docId]: initialLikes });
    return initialLikes;
  }
}, { module: 'firebase' });

// Listen for like toggle events from modal — now includes galleryId
bus.on('like:toggle', async ({ url, increment, galleryId }) => {
  if (!store.get('functionalCookiesEnabled')) return;
  const newLikes = await updateLike(url, increment);
  if (newLikes !== null) {
    bus.emit('like:updated', { url, newLikes, galleryId });
  }
});

// Subscribe to consent changes to (re)init or teardown, then signal completion
bus.on('consent:updated', async (prefs) => {
  if (prefs.functional) {
    await initFirebase();
  } else {
    teardownFirebase();
  }
  // Signal that firebase work is done — gallery listens for this
  bus.emit('consent:applied', prefs);
});