/**
 * Context object returned by `createContext()`, carrying all
 * identifiers that should be attached to tracked events.
 */
export interface CorrelationContext {
  correlationId: string;
  sessionId?: string;
  userId?: string;
}

/**
 * Generate a V4-style random identifier without requiring the
 * `crypto` module, so this works in both browser and Node.js
 * without polyfills.
 */
function generateId(): string {
  // Use globalThis.crypto when available (Node ≥ 19 & browsers)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: manual pseudo-random UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Manages correlation IDs, session IDs, and user IDs for request
 * tracing and session tracking.
 *
 * A correlation ID is always available — if none has been set
 * explicitly, a new one is generated on demand.
 */
export class CorrelationManager {
  private correlationId: string | undefined;
  private sessionId: string | undefined;
  private userId: string | undefined;

  /** Explicitly set the correlation ID. */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Return the current correlation ID.
   * If none has been set, a new one is generated and cached.
   */
  getCorrelationId(): string {
    if (!this.correlationId) {
      this.correlationId = generateId();
    }
    return this.correlationId;
  }

  /** Set the session ID. */
  setSessionId(id: string): void {
    this.sessionId = id;
  }

  /** Return the current session ID, or `undefined` if not set. */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Set the user ID. */
  setUserId(id: string): void {
    this.userId = id;
  }

  /** Return the current user ID, or `undefined` if not set. */
  getUserId(): string | undefined {
    return this.userId;
  }

  /**
   * Build a context snapshot containing all current identifiers.
   * Undefined values are omitted from the returned object.
   */
  createContext(): CorrelationContext {
    const ctx: CorrelationContext = {
      correlationId: this.getCorrelationId(),
    };

    if (this.sessionId !== undefined) {
      ctx.sessionId = this.sessionId;
    }

    if (this.userId !== undefined) {
      ctx.userId = this.userId;
    }

    return ctx;
  }

  /** Reset all identifiers to their unset state. */
  reset(): void {
    this.correlationId = undefined;
    this.sessionId = undefined;
    this.userId = undefined;
  }
}

