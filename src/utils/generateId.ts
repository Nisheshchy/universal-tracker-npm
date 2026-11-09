/**
 * Unique identifier generation utilities.
 *
 * Prefer `crypto.randomUUID()` when available (Node ≥ 19, modern browsers).
 * Falls back to a manual hex-based generator for older runtimes.
 */

/**
 * Generate a random hex string of `byteLength * 2` characters.
 *
 * Uses `crypto.getRandomValues` when available, otherwise falls back to
 * `Math.random` (less secure but acceptable for non-cryptographic IDs).
 */
function randomHex(byteLength: number): string {
  try {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Environment without Web Crypto – fall back to Math.random.
    let hex = '';
    for (let i = 0; i < byteLength; i++) {
      hex += Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0');
    }
    return hex;
  }
}

/**
 * Build a v4-shaped UUID from raw hex bytes.
 *
 * Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
 * where `4` marks the version and `y` is one of `8`, `9`, `a`, or `b`.
 */
function formatUUID(hex: string): string {
  // Ensure version nibble (position 12) is '4'.
  const version = '4' + hex.slice(13, 16);

  // Ensure variant bits (position 16) are 10xx.
  const variantNibble = (parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8;
  const variant = variantNibble.toString(16) + hex.slice(17, 20);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    version,
    variant,
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Generate a unique event identifier (UUID v4).
 *
 * @returns A string in standard UUID format (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`).
 */
export function generateId(): string {
  // Prefer the native implementation when available.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return formatUUID(randomHex(16));
}

/**
 * Generate a correlation identifier suitable for distributed tracing.
 *
 * The returned value is a UUID v4 prefixed with `cor_` for easy visual
 * differentiation from regular event IDs.
 *
 * @returns A correlation identifier string (e.g. `cor_550e8400-e29b-41d4-a716-446655440000`).
 */
export function generateCorrelationId(): string {
  return `cor_${generateId()}`;
}
