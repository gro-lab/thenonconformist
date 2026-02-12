// ============================================
// ERROR HANDLER — Global safety nets
// Catches uncaught errors and unhandled rejections.
// Provides withErrorHandling() HOF for async functions.
// ============================================

class ErrorHandler {
  constructor() {
    window.addEventListener('error', (e) => {
      this.handle(e.error ?? new Error(e.message));
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.handle(e.reason);
    });
  }

  handle(error, context = {}) {
    const isExpected = error?.isOperational ?? false;
    console.error(
      `[${error?.name || 'Error'}]`,
      error?.message || error,
      context
    );

    if (isExpected) {
      this.showToast(error.message);
    } else {
      this.showToast('Something went wrong. Please try again.');
    }
  }

  showToast(message) {
    const el = document.getElementById('error-container');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => {
      el.hidden = true;
    }, 5000);
  }
}

// Self-initializing — import this module to install global handlers
export const errorHandler = new ErrorHandler();

/**
 * Higher-order function that wraps an async function with error handling.
 * Eliminates repetitive try/catch boilerplate.
 */
export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler.handle(error, context);
      return null;
    }
  };
}