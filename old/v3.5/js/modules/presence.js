// js/modules/presence.js
// Real-time "Active Viewers" presence system using Firebase Realtime Database
// Privacy-first: no user IDs, IP storage, or fingerprints
// GDPR-compliant: opt-in only (requires functional cookies)
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { errorHandler } from '../lib/error-handler.js';
import { dom } from '../dom-elements.js';

// ============================================
// CONSTANTS
// ============================================
const HEARTBEAT_INTERVAL_MS = 30_000;       // Update lastSeen every 30s
const STALE_THRESHOLD_MS = 60_000;          // Ignore entries older than 60s
const THROTTLE_WRITE_MS = 5_000;            // Max 1 DB write per 5s
const MODAL_DEBOUNCE_MS = 2_000;            // Only update DB if viewing same image for >2s

// ============================================
// STATE
// ============================================
let rtdb = null;                             // Firebase Realtime Database instance
let rtdbModules = null;                      // { ref, set, onValue, off, remove, onDisconnect, serverTimestamp, get }
let sessionId = null;                        // Auto-generated per connection
let heartbeatTimer = null;
let currentGalleryId = null;
let currentImageIndex = null;                // null = browsing grid, number = viewing modal
let currentListener = null;                  // { ref, galleryId } — active .on('value') listener
let lastWriteTime = 0;                       // Throttle writes
let modalDebounceTimer = null;
let isInitialized = false;
let isDisabled = false;                      // True if quota exceeded or fatal error
const busUnsubs = [];

// ============================================
// DYNAMIC SDK LOADER
// ============================================
async function loadRealtimeDBSDK() {
  if (rtdbModules) return rtdbModules;

  console.log('📦 Loading Firebase Realtime Database SDK...');
  try {
    const dbModule = await import(
      'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js'
    );

    rtdbModules = {
      getDatabase: dbModule.getDatabase,
      ref: dbModule.ref,
      set: dbModule.set,
      get: dbModule.get,
      onValue: dbModule.onValue,
      off: dbModule.off,
      remove: dbModule.remove,
      onDisconnect: dbModule.onDisconnect,
      serverTimestamp: dbModule.serverTimestamp,
    };

    console.log('✅ Firebase RTDB SDK loaded');
    return rtdbModules;
  } catch (error) {
    console.warn('⚠️ Failed to load Firebase RTDB SDK (ad blocker?):', error.message);
    isDisabled = true;
    return null;
  }
}

// ============================================
// GENERATE SESSION ID
// ============================================
function generateSessionId() {
  // Simple random ID — no fingerprinting
  return 's_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// ============================================
// INIT PRESENCE
// ============================================
export async function initPresence() {
  if (isInitialized || isDisabled) return;
  if (!store.get('functionalCookiesEnabled')) {
    console.log('⏸️ Presence not initialized: functional cookies disabled');
    return;
  }

  const firebaseApp = store.get('firebaseApp');
  if (!firebaseApp) {
    console.log('⏸️ Presence not initialized: Firebase app not ready');
    return;
  }

  try {
    const sdk = await loadRealtimeDBSDK();
    if (!sdk) return; // SDK blocked

    rtdb = sdk.getDatabase(firebaseApp);
    sessionId = generateSessionId();
    isInitialized = true;

    console.log('✅ Presence system initialized (session:', sessionId, ')');
  } catch (error) {
    console.warn('⚠️ Presence init failed:', error.message);
    isDisabled = true;
  }
}

// ============================================
// UPDATE PRESENCE — write session to RTDB
// ============================================
async function writePresence(galleryId, imageIndex) {
  if (!isInitialized || isDisabled || !rtdb || !rtdbModules || !sessionId) return;

  // Throttle writes
  const now = Date.now();
  if (now - lastWriteTime < THROTTLE_WRITE_MS) return;
  lastWriteTime = now;

  try {
    const sessionRef = rtdbModules.ref(rtdb, `presence/${galleryId}/${sessionId}`);

    await rtdbModules.set(sessionRef, {
      timestamp: rtdbModules.serverTimestamp(),
      imageIndex: imageIndex !== null && imageIndex !== undefined ? imageIndex : -1,
      lastSeen: rtdbModules.serverTimestamp(),
    });

    // Setup onDisconnect cleanup (re-register on each write for safety)
    await rtdbModules.onDisconnect(sessionRef).remove();
  } catch (error) {
    if (error.code === 'PERMISSION_DENIED' || error.message?.includes('quota')) {
      console.warn('⚠️ Presence quota/permission issue — disabling for session');
      isDisabled = true;
      hideAllIndicators();
    } else {
      console.warn('⚠️ Presence write failed:', error.message);
    }
  }
}

// ============================================
// UPDATE PRESENCE (public API)
// ============================================
export function updatePresence(galleryId, imageIndex = null) {
  if (!isInitialized || isDisabled) return;

  currentGalleryId = galleryId;
  currentImageIndex = imageIndex;

  writePresence(galleryId, imageIndex);
  subscribeToPresence(galleryId);
}

// ============================================
// UPDATE PRESENCE FOR MODAL (debounced)
// ============================================
export function updatePresenceForModal(galleryId, imageIndex) {
  if (!isInitialized || isDisabled) return;

  // Clear previous debounce
  if (modalDebounceTimer) {
    clearTimeout(modalDebounceTimer);
    modalDebounceTimer = null;
  }

  currentImageIndex = imageIndex;

  // Wait MODAL_DEBOUNCE_MS before writing (avoids spam on prev/next)
  modalDebounceTimer = setTimeout(() => {
    writePresence(galleryId, imageIndex);
  }, MODAL_DEBOUNCE_MS);
}

// ============================================
// SUBSCRIBE TO PRESENCE — listen for changes
// ============================================
function subscribeToPresence(galleryId) {
  if (!isInitialized || isDisabled || !rtdb || !rtdbModules) return;

  // Unsubscribe from previous gallery
  unsubscribePresence();

  try {
    const galleryRef = rtdbModules.ref(rtdb, `presence/${galleryId}`);

    rtdbModules.onValue(galleryRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        updatePresenceStore(0, 0);
        return;
      }

      const now = Date.now();
      let galleryCount = 0;
      let imageCount = 0;

      Object.entries(data).forEach(([sid, entry]) => {
        // Safety net: filter stale entries (>60s old)
        // Note: serverTimestamp may be slightly different from client time,
        // so we use lastSeen which is set on each write
        if (entry.lastSeen && (now - entry.lastSeen) > STALE_THRESHOLD_MS) {
          return; // Skip stale
        }

        galleryCount++;

        // Count viewers of the specific image currently in modal
        if (
          currentImageIndex !== null &&
          currentImageIndex !== undefined &&
          entry.imageIndex === currentImageIndex
        ) {
          imageCount++;
        }
      });

      updatePresenceStore(galleryCount, imageCount);
    }, (error) => {
      console.warn('⚠️ Presence listener error:', error.message);
      if (error.code === 'PERMISSION_DENIED') {
        isDisabled = true;
        hideAllIndicators();
      }
    });

    currentListener = { ref: galleryRef, galleryId };
  } catch (error) {
    console.warn('⚠️ Failed to subscribe to presence:', error.message);
  }
}

// ============================================
// UNSUBSCRIBE FROM PRESENCE LISTENER
// ============================================
function unsubscribePresence() {
  if (currentListener && rtdbModules) {
    try {
      rtdbModules.off(currentListener.ref);
    } catch (_) { /* ok */ }
    currentListener = null;
  }
}

// ============================================
// UPDATE STORE & UI
// ============================================
function updatePresenceStore(galleryCount, imageCount) {
  store.set('presence', {
    galleryCount,
    imageCount,
    isConnected: isInitialized && !isDisabled,
  });
  updatePresenceUI(galleryCount, imageCount);
}

function updatePresenceUI(galleryCount, imageCount) {
  // Gallery indicator
  const galleryIndicator = dom.presenceGallery;
  if (galleryIndicator) {
    if (galleryCount > 0) {
      const countEl = galleryIndicator.querySelector('.presence-count');
      if (countEl) countEl.textContent = `${galleryCount} viewing`;
      galleryIndicator.hidden = false;
    } else {
      galleryIndicator.hidden = true;
    }
  }

  // Image/modal indicator
  const imageIndicator = dom.presenceImage;
  if (imageIndicator) {
    // Show only if modal is open and more than 1 viewer (hide when only self)
    if (store.get('isModalOpen') && imageCount > 1) {
      const countEl = imageIndicator.querySelector('.presence-count');
      if (countEl) countEl.textContent = `${imageCount} viewing this`;
      imageIndicator.hidden = false;
    } else {
      imageIndicator.hidden = true;
    }
  }
}

function hideAllIndicators() {
  const galleryIndicator = dom.presenceGallery;
  const imageIndicator = dom.presenceImage;
  if (galleryIndicator) galleryIndicator.hidden = true;
  if (imageIndicator) imageIndicator.hidden = true;
}

// ============================================
// HEARTBEAT — keep session alive
// ============================================
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (currentGalleryId && isInitialized && !isDisabled) {
      writePresence(currentGalleryId, currentImageIndex);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ============================================
// CLEANUP — remove session from RTDB
// ============================================
export async function cleanupPresence() {
  // Clear timers
  stopHeartbeat();
  if (modalDebounceTimer) {
    clearTimeout(modalDebounceTimer);
    modalDebounceTimer = null;
  }

  // Unsubscribe listener
  unsubscribePresence();

  // Remove session from RTDB
  if (isInitialized && rtdb && rtdbModules && sessionId && currentGalleryId) {
    try {
      const sessionRef = rtdbModules.ref(rtdb, `presence/${currentGalleryId}/${sessionId}`);
      await rtdbModules.remove(sessionRef);
    } catch (_) { /* best effort */ }
  }

  // Hide UI
  hideAllIndicators();
  updatePresenceStore(0, 0);

  currentGalleryId = null;
  currentImageIndex = null;
}

// ============================================
// FULL TEARDOWN — disconnect entirely
// ============================================
export function teardownPresence() {
  cleanupPresence();
  rtdb = null;
  rtdbModules = null;
  sessionId = null;
  isInitialized = false;
  // Note: don't reset isDisabled here — it persists for the session
  busUnsubs.forEach(unsub => unsub());
  busUnsubs.length = 0;
}

// ============================================
// EVENT SUBSCRIPTIONS
// ============================================
function subscribeToEvents() {
  // Gallery opened — start presence tracking
  busUnsubs.push(
    bus.on('gallery:open', async (galleryId) => {
      if (!isInitialized && store.get('functionalCookiesEnabled')) {
        await initPresence();
      }
      if (isInitialized && !isDisabled) {
        updatePresence(galleryId, null);
        startHeartbeat();
      }
    })
  );

  // Gallery closed — stop tracking
  busUnsubs.push(
    bus.on('gallery:close', () => {
      cleanupPresence();
    })
  );

  // Photo selected in modal — update to image-level presence
  busUnsubs.push(
    bus.on('photo:select', ({ galleryId, index }) => {
      if (isInitialized && !isDisabled) {
        updatePresenceForModal(galleryId, index);
      }
    })
  );

  // Modal closed — revert to gallery-level presence
  busUnsubs.push(
    bus.on('modal:close', () => {
      if (isInitialized && !isDisabled && currentGalleryId) {
        currentImageIndex = null;
        writePresence(currentGalleryId, null);
        // Update UI immediately
        const presence = store.get('presence') || {};
        updatePresenceUI(presence.galleryCount || 0, 0);
      }
    })
  );

  // Consent updated — init or teardown
  busUnsubs.push(
    bus.on('consent:applied', async (prefs) => {
      if (prefs.functional) {
        // Will init on next gallery:open if not already
      } else {
        teardownPresence();
      }
    })
  );
}

// ============================================
// PUBLIC: Module init (called from app.js)
// ============================================
export function initPresenceModule() {
  console.log('👁️ Initializing presence module...');
  subscribeToEvents();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    cleanupPresence();
  });
}
