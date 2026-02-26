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

/**
 * Clamp a value between a minimum and maximum.
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum bound
 * @param {number} max - Maximum bound
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate the Euclidean distance between two points.
 * Useful for pinch-to-zoom gesture calculation.
 * @param {number} x1 - X coordinate of first point
 * @param {number} y1 - Y coordinate of first point
 * @param {number} x2 - X coordinate of second point
 * @param {number} y2 - Y coordinate of second point
 * @returns {number} Distance between the two points
 */
export function getDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
