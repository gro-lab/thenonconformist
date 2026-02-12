// js/lib/error-handler.js
export class AppError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = options.name || 'AppError';
        this.isOperational = options.isOperational ?? true;
        this.context = options.context || {};
        if (options.cause) this.cause = options.cause;
    }
}

export class NetworkError extends AppError {
    constructor(message, options = {}) {
        super(message, { ...options, name: 'NetworkError' });
    }
}

class ErrorHandler {
    constructor() {
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        window.addEventListener('error', (e) => {
            this.handle(e.error || new Error(e.message), { source: 'uncaught' });
        });
        window.addEventListener('unhandledrejection', (e) => {
            this.handle(e.reason, { source: 'unhandledRejection' });
        });
    }

    handle(error, context = {}) {
        const isExpected = error.isOperational ?? false;
        console.error(`[${error.name || 'Error'}]`, error.message, { ...context, ...error.context });

        // Show user-friendly message
        const message = isExpected
            ? error.message
            : 'Something went wrong. Please refresh the page.';
        this.showToast(message);
    }

    showToast(message) {
        // Simple in‑page toast – adapt to your existing #loading-indicator or create a dedicated one
        const toast = document.getElementById('error-toast');
        if (toast) {
            toast.textContent = message;
            toast.hidden = false;
            setTimeout(() => { toast.hidden = true; }, 5000);
        } else {
            // fallback alert (only for unexpected errors)
            if (!message.includes('refresh')) alert(message);
        }
    }
}

export const errorHandler = new ErrorHandler();

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