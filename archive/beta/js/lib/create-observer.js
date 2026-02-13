// js/lib/create-observer.js
// Factory for creating IntersectionObservers with a consistent API
export function createObserver({ targets, onIntersect, onExit, root = null, rootMargin = '0px', threshold = 0, once = false }) {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        onIntersect?.(entry, obs);
        if (once) obs.unobserve(entry.target);
      } else {
        onExit?.(entry, obs);
      }
    });
  }, { root, rootMargin, threshold });

  const observe = (el) => observer.observe(el);
  const unobserve = (el) => observer.unobserve(el);
  const disconnect = () => observer.disconnect();

  if (targets) {
    const elements = typeof targets === 'string'
      ? document.querySelectorAll(targets)
      : targets;
    if (elements) {
      // Handle both NodeList and single element
      const list = elements.forEach ? elements : [elements];
      list.forEach(el => observer.observe(el));
    }
  }

  return { observer, observe, unobserve, disconnect };
}
