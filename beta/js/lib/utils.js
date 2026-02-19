// js/lib/utils.js
// Shared utility functions used across modules

/**
 * Generate a Firestore-safe document ID from an image URL.
 * Centralised so every module uses the same encoding strategy.
 */
export const getDocIdFromUrl = (url) =>
  btoa(url).replace(/[^a-zA-Z0-9]/g, '');

/**
 * Debounce — delays execution until `ms` milliseconds after the last call.
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Shared transition duration — must match the CSS gallery transition */
export const TRANSITION_MS = 800;