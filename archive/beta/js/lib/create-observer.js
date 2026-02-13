// ============================================
// OBSERVER FACTORY — Reusable IntersectionObserver creator
// Collapses two near-identical observer functions into one
// ============================================

/**
 * Creates a configured IntersectionObserver with a clean API.
 *
 * @param {Object}  config
 * @param {string|NodeList|Element|Element[]} [config.targets]  - Selector or elements to observe
 * @param {Function} config.onIntersect - Called when element enters viewport
 * @param {Function} [config.onExit]    - Called when element leaves viewport
 * @param {Element}  [config.root]      - Scroll container (default: viewport)
 * @param {string}   [config.rootMargin]
 * @param {number|number[]} [config.threshold]
 * @param {boolean}  [config.once]      - Unobserve after first intersection
 * @returns {{ observer, observe, unobserve, disconnect }}
 */
export function createObserver({
  targets,
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
