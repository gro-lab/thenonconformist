// js/modules/firebase.js
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { withErrorHandling, NetworkError } from '../lib/error-handler.js';

let firebaseModules = null;
let app = null;
let db = null;

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBMt3p3OCOUcMb4mdpfaCEhzxhlsRSTej8",
    authDomain: "thenonconformistdotxyz.firebaseapp.com",
    projectId: "thenonconformistdotxyz",
    storageBucket: "thenonconformistdotxyz.firebasestorage.app",
    messagingSenderId: "552037212425",
    appId: "1:552037212425:web:b0ddaed6ebbc34442f73d8"
};

// ---------- Private helpers ----------
async function loadFirebaseSDK() {
    if (firebaseModules) return firebaseModules;
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
        return firebaseModules;
    } catch (err) {
        throw new NetworkError('Failed to load Firebase SDK', { cause: err });
    }
}

async function initFirebase() {
    if (app) return;
    const firebase = await loadFirebaseSDK();
    app = firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.getFirestore(app);
}

function getDocIdFromUrl(url) {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '');
}

// ---------- Public API ----------
export async function fetchAllLikes() {
    if (!store.get('functionalCookiesEnabled') || !db || !firebaseModules) {
        return {};
    }
    try {
        const firebase = firebaseModules;
        const querySnapshot = await firebase.getDocs(firebase.collection(db, 'image_likes'));
        const likes = {};
        querySnapshot.forEach(doc => { likes[doc.id] = doc.data().likes || 0; });
        store.set('likesCache', likes);
        return likes;
    } catch (err) {
        console.error('fetchAllLikes error:', err);
        return {};
    }
}

export async function updateLike(url, incrementValue) {
    if (!store.get('functionalCookiesEnabled') || !db || !firebaseModules) {
        return null;
    }
    try {
        const firebase = firebaseModules;
        const docId = getDocIdFromUrl(url);
        const docRef = firebase.doc(db, 'image_likes', docId);
        const docSnap = await firebase.getDoc(docRef);

        let newLikes;
        if (docSnap.exists()) {
            await firebase.updateDoc(docRef, {
                likes: firebase.increment(incrementValue),
                lastUpdated: firebase.serverTimestamp()
            });
            const updatedSnap = await firebase.getDoc(docRef);
            newLikes = updatedSnap.data().likes;
        } else {
            const initialLikes = Math.max(0, incrementValue);
            await firebase.setDoc(docRef, {
                url,
                likes: initialLikes,
                createdAt: firebase.serverTimestamp(),
                lastUpdated: firebase.serverTimestamp()
            });
            newLikes = initialLikes;
        }

        // Update cache
        const cache = store.get('likesCache');
        cache[docId] = newLikes;
        store.set('likesCache', { ...cache }); // trigger proxy
        return newLikes;
    } catch (err) {
        console.error('updateLike error:', err);
        return null;
    }
}

export function teardownFirebase() {
    app = null;
    db = null;
    firebaseModules = null;
    store.set('likesCache', {});
    // Do not touch store.get('functionalCookiesEnabled') – that's managed by cookies module
}

// ---------- Consent listener ----------
bus.on('consent:functional', async (enabled) => {
    if (enabled) {
        await withErrorHandling(initFirebase, { module: 'firebase' })();
        await withErrorHandling(fetchAllLikes, { module: 'firebase' })();
    } else {
        teardownFirebase();
    }
});