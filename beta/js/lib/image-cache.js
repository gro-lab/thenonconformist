// js/lib/image-cache.js
// In-memory blob-URL cache for all images (thumbnails + full-size).
// Shared by gallery.js (masonry thumbnails) and modal.js (full-size images).
//
// Design:
//  • load(url)   — primary API: returns a blob: URL, fetching + caching on miss.
//  • has/get/set  — low-level access for synchronous cache hits (masonry fast-path).
//  • invalidate   — per-entry eviction on like:updated.
//  • clear        — full teardown (called by destroyGallery).
//
// No eviction cap — the portfolio has a bounded image set (thumbnails + full-size
// for a few hundred photos). Blob URLs are lightweight handles; the browser manages
// the underlying ArrayBuffer memory and releases it under pressure automatically.

class ImageCache {
  constructor() {
    /** @type {Map<string, string>}  originalUrl → blobUrl */
    this._cache = new Map();
    /** @type {Map<string, Promise<string>>}  in-flight fetches (dedup concurrent requests) */
    this._inflight = new Map();
  }

  // ─── Primary API ─────────────────────────────────────────────────────────

  /**
   * Returns a blob: URL for `url`, using the cache when available.
   * Concurrent calls for the same URL share a single in-flight fetch.
   * On network failure, falls back to the original URL (browser may serve
   * it from its own HTTP cache).
   *
   * @param {string} url
   * @returns {Promise<string>}  blob: URL on success, original URL on failure.
   */
  load(url) {
    // Synchronous cache hit
    if (this._cache.has(url)) {
      console.debug(`⚡ [ImageCache] HIT (${this._cache.size} cached): ${url.split('/').pop()}`);
      return Promise.resolve(this._cache.get(url));
    }

    // Deduplicate concurrent fetches for the same URL
    if (this._inflight.has(url)) {
      console.debug(`⏳ [ImageCache] IN-FLIGHT (joining): ${url.split('/').pop()}`);
      return this._inflight.get(url);
    }

    // Cache miss — start a new fetch
    const promise = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        this._cache.set(url, blobUrl);
        console.debug(`💾 [ImageCache] STORED (${this._cache.size} cached): ${url.split('/').pop()}`);
        return blobUrl;
      })
      .catch(err => {
        // Network / CORS failure — don't cache, let caller use original URL
        console.warn(`⚠️ [ImageCache] fetch failed for ${url.split('/').pop()}, falling back:`, err.message);
        return url;
      })
      .finally(() => {
        this._inflight.delete(url);
      });

    this._inflight.set(url, promise);
    return promise;
  }

  // ─── Synchronous accessors (for masonry fast-path) ───────────────────────

  /** True if a blob URL is already stored for this URL. */
  has(url) {
    return this._cache.has(url);
  }

  /**
   * Returns the cached blob URL synchronously, or null.
   * Use only after confirming has() — prefer load() for the general case.
   * @param {string} url
   * @returns {string|null}
   */
  get(url) {
    return this._cache.get(url) ?? null;
  }

  // ─── Invalidation ────────────────────────────────────────────────────────

  /**
   * Removes a single entry and revokes its blob URL.
   * Call when like:updated fires for a specific image so the next render
   * re-fetches fresh data (thumbnail + full-size share the same invalidation).
   * @param {string} url
   */
  invalidate(url) {
    if (!this._cache.has(url)) return;
    try { URL.revokeObjectURL(this._cache.get(url)); } catch (_) { /* ignore */ }
    this._cache.delete(url);
    console.debug(`♻️ [ImageCache] Invalidated: ${url.split('/').pop()}`);
  }

  /** Revokes all blob URLs and clears the cache. Call on destroyGallery. */
  clear() {
    this._cache.forEach(blobUrl => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
    });
    this._cache.clear();
    console.debug('🧹 [ImageCache] Cache cleared');
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  get size() { return this._cache.size; }
}

// Singleton — shared across gallery.js and modal.js for the page lifetime.
export const imageCache = new ImageCache();
