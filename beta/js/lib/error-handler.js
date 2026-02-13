// js/lib/error-handler.js
// Centralized error handling with global listeners and toast UI

// Base error class with operational flag
export class OperationalError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'OperationalError';
    this.isOperational = true;
    this.context = options.context || {};
  }
}

class ErrorHandler {
  constructor() {
    this.toastTimeout = null;
  }

  setupGlobalHandlers() {
    window.addEventListener('error', (e) => {
      this.handle(e.error || new Error(e.message), { source: 'uncaught' });
      // Don't prevent default; still log to console
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.handle(e.reason, { source: 'unhandledRejection' });
    });
  }

  handle(error, context = {}) {
    // Determine if it's an expected operational error
    const isOperational = error.isOperational === true;
    const errorName = error.name || 'Error';
    const message = error.message || 'Unknown error';

    // Always log to console with context
    console.error(`[${errorName}]`, message, { ...context, stack: error.stack });

    // Show user-friendly message based on type
    if (isOperational) {
      this.showToast(message);
    } else {
      this.showToast('Something went wrong. Please try again.');
    }
  }

  showToast(message, duration = 5000) {
    // Look for existing toast container or create one
    let container = document.getElementById('error-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'error-container';
      container.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4444;
        color: white;
        padding: 12px 24px;
        border-radius: 999px;
        font-size: 0.9rem;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transition: opacity 0.3s;
      `;
      document.body.appendChild(container);
    }

    // Clear any existing timeout
    if (this.toastTimeout) clearTimeout(this.toastTimeout);

    container.textContent = message;
    container.style.opacity = '1';

    this.toastTimeout = setTimeout(() => {
      container.style.opacity = '0';
    }, duration);
  }
}

// Higher-order function to wrap async functions with automatic error handling
export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler.handle(error, context);
      return null; // or rethrow? We'll return null to allow graceful degradation
    }
  };
}

export const errorHandler = new ErrorHandler();