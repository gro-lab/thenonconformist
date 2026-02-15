// js/lib/event-bus.js
// Simple pub/sub event bus for decoupled communication

export class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, fn) {
    (this.listeners[event] ??= []).push(fn);
    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    };
  }

  once(event, fn) {
    const wrapper = (data) => {
      fn(data);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }

  emit(event, data) {
    this.listeners[event]?.forEach(fn => fn(data));
  }

  clear(event) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

// Singleton instance for app-wide use
export const bus = new EventBus();