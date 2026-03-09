// js/lib/image-cache.js
// LRU in-memory cache for gallery thumbnail blob URLs.
// Avoids redundant network fetches when re-rendering the masonry grid
// (e.g. after like-count updates that trigger a re-sort).
//
// Design decisions:
//  • Uses fetch() + URL.createObjectURL() so blobs are held in memory and
//    served instantly as CSS background-image values on repeat views.
//  • Map iteration order is insertion order in V8 — we exploit that for O(1)
//    LRU: delete-then-re-insert on every hit to keep MRU entries at the tail.
//  • Evicted entries have their object URL revoked to release memory.
//  • Max size is 50 entries (configurable via constructor).

const DEFAULT_MAX_SIZE = 50;

class LRUImageCache {
  /**
   * @param {number} maxSize  Maximum number of blob URLs to hold in memory.
   */
  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
    /** @type {Map<string, string>}  url → blobUrl */
    this._cache = new Map();
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  /** Returns true if the URL has a valid cached blob. */
  has(url) {
    return this._cache.has(url);
  }

  /**
   * Returns the cached blob URL for `url`, promoting it to MRU position.
   * Returns null if not cached.
   * @param {string} url
   * @returns {string|null}
   */
  get(url) {
    if (!this._cache.has(url)) return null;
    const blobUrl = this._cache.get(url);
    // Promote to MRU: remove and re-insert at tail
    this._cache.delete(url);
    this._cache.set(url, blobUrl);
    return blobUrl;
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  /**
   * Stores a blob URL for `url`. Evicts the LRU entry if the cache is full.
   * @param {string} url       Original image/thumbnail URL (cache key).
   * @param {string} blobUrl   Object URL from URL.createObjectURL().
   */
  set(url, blobUrl) {
    if (this._cache.has(url)) {
      // Already exists — just promote to MRU
      this._cache.delete(url);
    } else if (this._cache.size >= this.maxSize) {
      // Evict least-recently-used (first entry in Map)
      const lruKey = this._cache.keys().next().value;
      const lruBlob = this._cache.get(lruKey);
      try { URL.revokeObjectURL(lruBlob); } catch (_) { /* ignore */ }
      this._cache.delete(lruKey);
      console.debug(`🗑️ [ImageCache] LRU evicted (${this._cache.size + 1}/${this.maxSize}): ${lruKey.split('/').pop()}`);
    }
    this._cache.set(url, blobUrl);
  }

  // ─── Invalidation ────────────────────────────────────────────────────────

  /**
   * Removes a single entry and revokes its blob URL.
   * Call this when `like:updated` fires so the next render does a fresh fetch.
   * @param {string} url
   */
  invalidate(url) {
    if (!this._cache.has(url)) return;
    const blobUrl = this._cache.get(url);
    try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
    this._cache.delete(url);
    console.debug(`♻️ [ImageCache] Invalidated: ${url.split('/').pop()}`);
  }

  /** Revokes all blob URLs and clears the cache. */
  clear() {
    this._cache.forEach((blobUrl) => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
    });
    this._cache.clear();
    console.debug('🧹 [ImageCache] Cache cleared');
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  get size() { return this._cache.size; }

  stats() {
    return { size: this._cache.size, maxSize: this.maxSize };
  }
}

// Singleton — shared across all gallery renders for the lifetime of the page.
export const imageCache = new LRUImageCache(DEFAULT_MAX_SIZE);
