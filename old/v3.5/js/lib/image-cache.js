// js/lib/image-cache.js
// Blob-URL cache for thumbnail and full-size images.
// No eviction — the image set is bounded (a few hundred) and the browser
// handles memory pressure. A plain Map is all we need.

class ImageCache {
  constructor() {
    this._cache    = new Map(); // url → blobURL
    this._inflight = new Map(); // url → Promise<blobURL>
  }

  // Synchronous hit test
  has(url) {
    return this._cache.has(url);
  }

  // Synchronous read — returns blobURL or undefined
  get(url) {
    return this._cache.get(url);
  }

  // Fetch-and-cache. Returns Promise<blobURL>.
  // Concurrent callers for the same URL share one HTTP request.
  load(url) {
    // Synchronous hit
    if (this._cache.has(url)) return Promise.resolve(this._cache.get(url));

    // In-flight dedup
    if (this._inflight.has(url)) return this._inflight.get(url);

    const promise = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`ImageCache: ${res.status} ${url}`);
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        this._cache.set(url, blobUrl);
        this._inflight.delete(url);
        return blobUrl;
      })
      .catch(err => {
        this._inflight.delete(url);
        throw err;
      });

    this._inflight.set(url, promise);
    return promise;
  }

  // Remove a single entry — call when like:updated invalidates an image
  invalidate(url) {
    const blobUrl = this._cache.get(url);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    this._cache.delete(url);
    // Any in-flight promise will complete and store; next invalidate() call
    // will clean it up. That's fine — likes fire once per user interaction.
  }

  // Wipe everything (e.g. on clear-data)
  clear() {
    this._cache.forEach(blobUrl => URL.revokeObjectURL(blobUrl));
    this._cache.clear();
    this._inflight.clear();
  }
}

// Singleton shared by gallery.js and modal.js
export const imageCache = new ImageCache();
