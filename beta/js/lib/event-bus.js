// ============================================
// EVENT BUS — Pub/sub for cross-module communication
// Modules never import each other directly;
// they communicate through named events on this bus.
// ============================================

export class EventBus {
  constructor() {
    this.listeners = {};
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} unsubscribe
   */
  on(event, fn) {
    (this.listeners[event] ??= []).push(fn);
    return () => {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    };
  }

  /**
   * Emit an event with optional data payload.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    this.listeners[event]?.forEach((fn) => fn(data));
  }

  /**
   * Subscribe to an event, but only fire once.
   * @param {string} event
   * @param {Function} fn
   */
  once(event, fn) {
    const unsub = this.on(event, (data) => {
      unsub();
      fn(data);
    });
    return unsub;
  }
}

// Singleton instance shared across all modules
export const bus = new EventBus();