// js/lib/image-cache.js
// In-memory cache for gallery thumbnail blob URLs.
// Avoids redundant network fetches when the masonry grid re-renders
// (e.g. after a like-count update triggers a re-sort).
//
// Design decisions:
//  • Uses fetch() + URL.createObjectURL() so blobs are held in browser memory
//    and served instantly as CSS background-image values on repeat views.
//  • No eviction cap — the portfolio has a bounded image count (a few hundred
//    at most) and blob URLs are lightweight handles; the browser manages the
//    underlying memory and will release it under pressure automatically.
//  • Invalidation is still supported per-entry so that a liked image's
//    thumbnail is re-fetched on the next render cycle.
//  • All object URLs are revoked on clear() (page teardown / destroyGallery).

class ImageCache {
  constructor() {
    /** @type {Map<string, string>}  originalUrl → blobUrl */
    this._cache = new Map();
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  /** Returns true if the URL has a cached blob. */
  has(url) {
    return this._cache.has(url);
  }

  /**
   * Returns the cached blob URL for `url`, or null if not cached.
   * @param {string} url
   * @returns {string|null}
   */
  get(url) {
    return this._cache.get(url) ?? null;
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  /**
   * Stores a blob URL for `url`.
   * @param {string} url       Original image/thumbnail URL (cache key).
   * @param {string} blobUrl   Object URL from URL.createObjectURL().
   */
  set(url, blobUrl) {
    this._cache.set(url, blobUrl);
  }

  // ─── Invalidation ────────────────────────────────────────────────────────

  /**
   * Removes a single entry and revokes its blob URL.
   * Call when `like:updated` fires so the next render does a fresh fetch.
   * @param {string} url
   */
  invalidate(url) {
    if (!this._cache.has(url)) return;
    try { URL.revokeObjectURL(this._cache.get(url)); } catch (_) { /* ignore */ }
    this._cache.delete(url);
    console.debug(`♻️ [ImageCache] Invalidated: ${url.split('/').pop()}`);
  }

  /** Revokes all blob URLs and clears the cache (call on destroyGallery). */
  clear() {
    this._cache.forEach((blobUrl) => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
    });
    this._cache.clear();
    console.debug('🧹 [ImageCache] Cache cleared');
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  get size() { return this._cache.size; }
}

// Singleton — shared across all gallery renders for the lifetime of the page.
export const imageCache = new ImageCache();
