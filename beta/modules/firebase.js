import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';

let modules = null;
let app = null;

export async function loadFirebaseSDK() {
  if (modules) return modules;
  const [appModule, firestoreModule] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js'),
  ]);
  modules = {
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
  return modules;
}

export async function initFirebase() {
  if (app) return;
  const fb = await loadFirebaseSDK();
  const config = {
    apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
    authDomain: "thenonconformistdotxyz.firebaseapp.com",
    projectId: "thenonconformistdotxyz",
    storageBucket: "thenonconformistdotxyz.firebasestorage.app",
    messagingSenderId: "552037212425",
    appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8"
  };
  app = fb.initializeApp(config);
  const db = fb.getFirestore(app);
  store.set('db', db);
  store.set('firebaseModules', fb);
  store.set('firebaseReady', true);
  await fetchAllLikes();
}

export function teardownFirebase() {
  app = null;
  store.set('db', null);
  store.set('firebaseModules', null);
  store.set('firebaseReady', false);
  store.set('likesCache', {});
}

export async function fetchAllLikes() {
  if (!store.get('functionalCookies') || !store.get('db')) return {};
  const fb = store.get('firebaseModules');
  const db = store.get('db');
  const snap = await fb.getDocs(fb.collection(db, 'image_likes'));
  const likes = {};
  snap.forEach(doc => { likes[doc.id] = doc.data().likes || 0; });
  store.set('likesCache', likes);
  bus.emit('likes:updated', likes);
  return likes;
}

export async function updateLike(url, incrementValue) {
  if (!store.get('functionalCookies') || !store.get('db')) return null;
  const fb = store.get('firebaseModules');
  const db = store.get('db');
  const docId = btoa(url).replace(/[^a-zA-Z0-9]/g, '');
  const ref = fb.doc(db, 'image_likes', docId);
  const snap = await fb.getDoc(ref);
  if (snap.exists()) {
    await fb.updateDoc(ref, { likes: fb.increment(incrementValue), lastUpdated: fb.serverTimestamp() });
  } else {
    await fb.setDoc(ref, {
      url,
      likes: Math.max(0, incrementValue),
      createdAt: fb.serverTimestamp(),
      lastUpdated: fb.serverTimestamp(),
    });
  }
  const updated = await fb.getDoc(ref);
  const newLikes = updated.data().likes;
  const cache = store.get('likesCache');
  cache[docId] = newLikes;
  store.set('likesCache', cache);
  return newLikes;
}