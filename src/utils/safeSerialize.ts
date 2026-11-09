/**
 * Safe JSON serialization utilities.
 *
 * Prevents runtime crashes from:
 * - Circular object references
 * - BigInt values (converts to string)
 * - Non-serializable types (Functions, Symbols, Errors, Maps, Sets)
 * - Payload size limit enforcement
 */

export interface SafeSerializeOptions {
  /** Maximum string length allowed for the serialized output. */
  readonly maxPayloadSize?: number;
  /** Pretty-print indent spaces. */
  readonly space?: number | string;
  /** Replacement string when max payload size is exceeded. */
  readonly truncationPlaceholder?: string;
}

/**
 * Serialize any JavaScript value to a JSON string safely without throwing
 * on circular structures, BigInts, or unhandled objects.
 */
export function safeSerialize(value: unknown, options: SafeSerializeOptions = {}): string {
  const seen = new WeakSet<object>();

  function replacer(this: unknown, _key: string, val: unknown): unknown {
    if (typeof val === 'bigint') {
      return val.toString();
    }

    if (val instanceof Error) {
      return {
        name: val.name,
        message: val.message,
        stack: val.stack,
      };
    }

    if (val instanceof Map) {
      const entries: Record<string, unknown> = {};
      for (const [k, v] of val.entries()) {
        entries[String(k)] = v;
      }
      return entries;
    }

    if (val instanceof Set) {
      return Array.from(val.values());
    }

    if (typeof val === 'function' || typeof val === 'symbol') {
      return undefined;
    }

    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }

    return val;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value, replacer, options.space);
  } catch (err) {
    // Extreme fallback if stringify still encounters unexpected issues
    serialized = JSON.stringify({
      _error: 'SerializationFailed',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (options.maxPayloadSize !== undefined && options.maxPayloadSize > 0) {
    if (serialized.length > options.maxPayloadSize) {
      const placeholder = options.truncationPlaceholder ?? '[TRUNCATED: Payload exceeded limit]';
      return JSON.stringify({
        _truncated: true,
        originalBytes: serialized.length,
        maxBytes: options.maxPayloadSize,
        preview: serialized.slice(0, Math.max(0, options.maxPayloadSize - 100)) + '...',
        message: placeholder,
      });
    }
  }

  return serialized;
}

/**
 * Safely parse a JSON string, returning a fallback value if parsing fails.
 */
export function safeParse<T = unknown>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
