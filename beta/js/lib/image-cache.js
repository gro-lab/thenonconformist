// js/lib/image-cache.js
// Shared in-memory blob cache for gallery thumbnails AND full-size modal images.
//
// Design decisions:
//  • Single cache, two callers (gallery.js for thumbnails, modal.js for full-size).
//    Both share the same Map so a URL is never fetched twice regardless of which
//    module requested it first.
//  • load(url) is the primary public API. It fetches → blobs → stores and returns
//    a blob: URL. Concurrent calls for the same URL share one in-flight Promise
//    via _inflight so only one HTTP request is ever made.
//  • Synchronous has()/get() accessors remain for the masonry fast-path (instant
//    background-image apply without awaiting anything).
//  • No eviction cap — the portfolio has a bounded image set; the browser manages
//    memory under pressure automatically.
//  • invalidate(url) revokes one entry (called on like:updated so a re-sorted
//    thumbnail is re-fetched on the next render).
//  • clear() revokes all object URLs (called in destroyGallery on teardown).

class ImageCache {
  constructor() {
    /** @type {Map<string, string>}  originalUrl → blobUrl */
    this._cache = new Map();

    /** @type {Map<string, Promise<string>>}  originalUrl → in-flight fetch promise */
    this._inflight = new Map();
  }

  // ─── Synchronous read (fast-path) ────────────────────────────────────────

  /** Returns true if the URL has a cached blob (no fetch needed). */
  has(url) {
    return this._cache.has(url);
  }

  /**
   * Returns the cached blob URL synchronously, or null if not yet cached.
   * Use this when you can apply the image immediately without awaiting.
   * @param {string} url
   * @returns {string|null}
   */
  get(url) {
    return this._cache.get(url) ?? null;
  }

  // ─── Async load (primary API) ─────────────────────────────────────────────

  /**
   * Returns a blob: URL for `url`, fetching and caching it if necessary.
   *
   * - Cache hit  → resolves synchronously from Map (no network).
   * - In-flight  → joins the existing Promise (one HTTP request, many waiters).
   * - Cache miss → fetches, stores blob URL, resolves all waiters.
   * - On error   → falls back to the original URL so the browser can try directly.
   *
   * @param {string} url  Image URL to load (thumbnail or full-size).
   * @returns {Promise<string>}  A blob: URL on success, original URL on failure.
   */
  load(url) {
    // ── Synchronous hit ───────────────────────────────────────────────────
    if (this._cache.has(url)) {
      console.debug(`⚡ [ImageCache] HIT (${this._cache.size} cached): ${url.split('/').pop()}`);
      return Promise.resolve(this._cache.get(url));
    }

    // ── Already fetching ──────────────────────────────────────────────────
    if (this._inflight.has(url)) {
      console.debug(`⏳ [ImageCache] IN-FLIGHT: ${url.split('/').pop()}`);
      return this._inflight.get(url);
    }

    // ── Cache miss: start fetch ───────────────────────────────────────────
    const promise = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        this._cache.set(url, blobUrl);
        this._inflight.delete(url);
        console.debug(`💾 [ImageCache] STORED (${this._cache.size} cached): ${url.split('/').pop()}`);
        return blobUrl;
      })
      .catch(err => {
        this._inflight.delete(url);
        // Fall back to original URL — browser HTTP cache may satisfy it
        console.warn(`⚠️ [ImageCache] fetch failed for ${url.split('/').pop()}, falling back:`, err.message);
        return url;
      });

    this._inflight.set(url, promise);
    return promise;
  }

  // ─── Invalidation ─────────────────────────────────────────────────────────

  /**
   * Removes one entry and revokes its blob URL.
   * Called when like:updated fires so the affected image is re-fetched on
   * the next render instead of serving a stale cached blob.
   * @param {string} url
   */
  invalidate(url) {
    if (!this._cache.has(url)) return;
    try { URL.revokeObjectURL(this._cache.get(url)); } catch (_) { /* ignore */ }
    this._cache.delete(url);
    console.debug(`♻️ [ImageCache] Invalidated: ${url.split('/').pop()}`);
  }

  /**
   * Revokes all blob URLs and clears the cache.
   * Call from destroyGallery() to release memory on module teardown.
   */
  clear() {
    this._cache.forEach(blobUrl => {
      try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
    });
    this._cache.clear();
    this._inflight.clear();
    console.debug('🧹 [ImageCache] Cache cleared');
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  get size() { return this._cache.size; }
}

// Singleton — shared across gallery.js and modal.js for the lifetime of the page.
export const imageCache = new ImageCache();
