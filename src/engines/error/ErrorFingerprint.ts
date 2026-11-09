export class ErrorFingerprint {
  /**
   * Generate a deterministic fingerprint for an error.
   */
  static generate(name: string, message: string, stack?: string): string {
    const normalizedMessage = this.normalizeMessage(message);
    const topFrame = this.extractTopFrame(stack);

    // Combine components
    const raw = `${name}::${normalizedMessage}::${topFrame}`;
    return this.hashString(raw);
  }

  /**
   * Normalize error message by stripping variable IDs, numbers, UUIDs, hex values.
   */
  private static normalizeMessage(message: string): string {
    return message
      // Replace UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      // Replace hex hashes/addresses
      .replace(/0x[0-9a-f]+/gi, '<HEX>')
      // Replace numbers
      .replace(/\b\d+\b/g, '<NUM>')
      .trim();
  }

  /**
   * Extract top caller frame from stack trace.
   */
  private static extractTopFrame(stack?: string): string {
    if (!stack) return 'unknown';

    const lines = stack.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip the error message line itself
      if (trimmed.startsWith('at ')) {
        // e.g. "at Object.capture (/path/to/file.js:10:5)" -> clean file and line
        return trimmed
          .replace(/\s+/g, ' ')
          .replace(/\(.*[\\/]/, '('); // strip path prefix for portability
      }
    }

    return 'unknown';
  }

  /**
   * 32-bit FNV-1a hash algorithm for fast, deterministic string fingerprinting.
   */
  private static hashString(str: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
