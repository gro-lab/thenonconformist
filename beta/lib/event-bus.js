export class EventBus {
  constructor() {
    this.listeners = {};
  }
  on(event, fn) {
    (this.listeners[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }
  emit(event, data) {
    this.listeners[event]?.forEach(fn => fn(data));
  }
}
export const bus = new EventBus();