// js/lib/event-bus.js
export class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    on(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(fn);
        return () => {
            const arr = this.listeners.get(event);
            if (arr) this.listeners.set(event, arr.filter(f => f !== fn));
        };
    }

    emit(event, data) {
        this.listeners.get(event)?.forEach(fn => fn(data));
    }

    once(event, fn) {
        const wrapper = (data) => {
            fn(data);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }

    off(event, fn) {
        const arr = this.listeners.get(event);
        if (arr) this.listeners.set(event, arr.filter(f => f !== fn));
    }
}

export const bus = new EventBus();