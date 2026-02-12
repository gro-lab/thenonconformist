// ============================================
// EVENT BUS — Pub/sub for cross-module communication
// Decouples modules so they never import each other directly
// ============================================

export class EventBus {
  constructor() {
    this.listeners = {};
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event, fn) {
    (this.listeners[event] ??= []).push(fn);
    return () => {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    };
  }

  /**
   * Emit an event with optional data payload.
   */
  emit(event, data) {
    this.listeners[event]?.forEach((fn) => fn(data));
  }

  /**
   * Remove a specific listener or all listeners for an event.
   */
  off(event, fn) {
    if (!this.listeners[event]) return;
    if (fn) {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    } else {
      delete this.listeners[event];
    }
  }
}

// Singleton instance shared across all modules
export const bus = new EventBus();
