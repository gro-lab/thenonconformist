// ============================================
// CREATE OBSERVER — Reusable IntersectionObserver factory
// Collapses duplicate observer creation into one
// configurable factory function.
// ============================================

/**
 * Create an IntersectionObserver with a clean config-driven API.
 *
 * @param {Object} config
 * @param {string|NodeList|Element|null} config.targets - Selector string, NodeList, or single Element
 * @param {Function} config.onIntersect - Called when target enters viewport
 * @param {Function} [config.onExit] - Called when target leaves viewport
 * @param {Element|null} [config.root] - Intersection root
 * @param {string} [config.rootMargin] - Root margin
 * @param {number|number[]} [config.threshold] - Intersection threshold(s)
 * @param {boolean} [config.once] - If true, unobserve after first intersection
 * @returns {{ observer, observe, unobserve, disconnect }}
 */
export function createObserver({
  targets = null,
  onIntersect,
  onExit,
  root = null,
  rootMargin = '0px',
  threshold = 0,
  once = false,
}) {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          onIntersect(entry, obs);
          if (once) obs.unobserve(entry.target);
        } else {
          onExit?.(entry, obs);
        }
      });
    },
    { root, rootMargin, threshold }
  );

  // Auto-observe initial targets if provided
  if (targets) {
    const elements =
      typeof targets === 'string'
        ? document.querySelectorAll(targets)
        : targets;

    const iterable = elements[Symbol.iterator] ? elements : [elements];
    [...iterable].forEach((el) => observer.observe(el));
  }

  return {
    observer,
    observe: (el) => observer.observe(el),
    unobserve: (el) => observer.unobserve(el),
    disconnect: () => observer.disconnect(),
  };
}
