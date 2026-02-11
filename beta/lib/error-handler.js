class ErrorHandler {
  constructor() {
    window.addEventListener('error', (e) => this.handle(e.error ?? new Error(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.handle(e.reason));
  }
  handle(error, context = {}) {
    const isExpected = error.isOperational ?? false;
    console.error(`[${error.name || 'Error'}]`, error.message, context);
    // optional toast – not implemented in original, but we'll keep console
  }
}
export const errorHandler = new ErrorHandler();

export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (err) { errorHandler.handle(err, context); return null; }
  };
}