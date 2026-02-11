export function createFSM(definition) {
  let current = definition.initial;
  const listeners = [];
  const fsm = {
    get state() { return current; },
    send(event, payload) {
      const transition = definition.states[current]?.[event];
      if (!transition) return false;
      const prev = current;
      current = transition.target;
      transition.action?.(payload);
      listeners.forEach(fn => fn({ prev, current, event, payload }));
      return true;
    },
    on(fn) {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    }
  };
  return fsm;
}