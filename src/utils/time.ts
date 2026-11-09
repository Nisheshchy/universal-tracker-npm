/**
 * Lightweight time utilities for the TrackFlow package.
 *
 * All helpers are side-effect-free and environment-safe (Node + browser).
 */

/**
 * Return the current date-time as an ISO 8601 string.
 *
 * @returns An ISO 8601 timestamp (e.g. `"2024-06-15T12:34:56.789Z"`).
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Return a high-resolution monotonic timestamp in milliseconds.
 *
 * Uses `performance.now()` when available (Node ≥ 16, browsers). Falls
 * back to `Date.now()` in environments without the Performance API.
 *
 * @returns Milliseconds (fractional) from an arbitrary epoch.
 */
export function hrtime(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Calculate the elapsed time in milliseconds since a previous
 * {@link hrtime} reading.
 *
 * @param start - A value previously returned by {@link hrtime}.
 * @returns Elapsed milliseconds (fractional).
 */
export function elapsed(start: number): number {
  return hrtime() - start;
}
