/**
 * Deep-clone and deep-equality utilities.
 *
 * Both functions protect against circular references / excessively nested
 * structures via a configurable depth limit.
 */

/** Default maximum traversal depth for recursive operations. */
const DEFAULT_MAX_DEPTH = 50;

/**
 * Create a deep copy of `obj`.
 *
 * Uses `structuredClone` when available. Falls back to a
 * `JSON.parse(JSON.stringify(...))` clone for environments that lack it
 * (e.g. older Node versions, some test runners).
 *
 * @typeParam T - The type of the value being cloned.
 * @param obj - The value to clone.
 * @returns A deep copy of `obj`.
 */
export function deepClone<T>(obj: T): T {
  // Primitives and null/undefined are returned as-is.
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Prefer the native structured-clone algorithm.
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }

  // Fallback: JSON round-trip (loses functions, RegExp, undefined values, etc.)
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ---------------------------------------------------------------------------
// Deep equality
// ---------------------------------------------------------------------------

/**
 * Recursively compare two values for structural equality.
 *
 * Handles primitives, `null`, `undefined`, `Date`, `RegExp`, arrays, and
 * plain objects. Protects against circular references by enforcing a depth
 * limit (default {@link DEFAULT_MAX_DEPTH}).
 *
 * @param a          - First value.
 * @param b          - Second value.
 * @param maxDepth   - Maximum recursion depth (default 50).
 * @returns `true` when `a` and `b` are structurally equal.
 */
export function deepEqual(
  a: unknown,
  b: unknown,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): boolean {
  return isEqual(a, b, 0, maxDepth);
}

// ---------------------------------------------------------------------------
// Internal recursive worker
// ---------------------------------------------------------------------------

function isEqual(
  a: unknown,
  b: unknown,
  depth: number,
  maxDepth: number,
): boolean {
  // Strict identity covers primitives, null, undefined, and same-ref objects.
  if (a === b) {
    return true;
  }

  // If either is null / undefined at this point they differ.
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }

  // Type mismatch.
  if (typeof a !== typeof b) {
    return false;
  }

  // NaN === NaN should be true.
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) {
      return true;
    }
    return false; // already failed strict ===
  }

  // Non-object primitives that weren't caught by === differ.
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  // Guard against circular references / extreme nesting.
  if (depth >= maxDepth) {
    return false;
  }

  // ---------- Date ----------
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof Date || b instanceof Date) {
    return false;
  }

  // ---------- RegExp ----------
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return false;
  }

  // ---------- Arrays ----------
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (aIsArray !== bIsArray) {
    return false;
  }

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i], depth + 1, maxDepth)) {
        return false;
      }
    }
    return true;
  }

  // ---------- Plain objects ----------
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) {
      return false;
    }
    if (!isEqual(aObj[key], bObj[key], depth + 1, maxDepth)) {
      return false;
    }
  }

  return true;
}
