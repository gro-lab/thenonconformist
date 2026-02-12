// js/lib/create-observer.js
export function createObserver({
    targets,
    onIntersect,
    onExit = null,
    root = null,
    rootMargin = '0px',
    threshold = 0,
    once = false
}) {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                onIntersect(entry, obs);
                if (once) obs.unobserve(entry.target);
            } else {
                onExit?.(entry, obs);
            }
        });
    }, { root, rootMargin, threshold });

    const elements = typeof targets === 'string'
        ? document.querySelectorAll(targets)
        : targets || [];

    if (elements) {
        (elements[Symbol.iterator] ? elements : [elements]).forEach(el => {
            if (el) observer.observe(el);
        });
    }

    return {
        observer,
        observe: el => observer.observe(el),
        unobserve: el => observer.unobserve(el),
        disconnect: () => observer.disconnect()
    };
}