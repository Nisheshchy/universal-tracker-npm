/**
 * Context object returned by `createContext()`, carrying all
 * identifiers that should be attached to tracked events.
 */
export interface CorrelationContext {
  correlationId: string;
  sessionId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceparentInfo {
  version: string;
  traceId: string;
  parentId: string;
  flags: string;
}

/**
 * Generate a V4-style random identifier without requiring the
 * `crypto` module, so this works in both browser and Node.js
 * without polyfills.
 */
function generateId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Generate a 32-character hex trace ID according to W3C Trace Context spec.
 */
export function generateTraceId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '').toLowerCase();
  }
  return (generateId() + generateId()).replace(/-/g, '').slice(0, 32).toLowerCase();
}

/**
 * Generate a 16-character hex span ID according to W3C Trace Context spec.
 */
export function generateSpanId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
  }
  return generateId().replace(/-/g, '').slice(0, 16).toLowerCase();
}

/**
 * Parse a W3C traceparent header string (e.g. `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`).
 */
export function parseTraceparent(header: string): TraceparentInfo | null {
  if (!header || typeof header !== 'string') return null;
  const trimmed = header.trim();
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(trimmed);
  if (!match) return null;

  const version = match[1];
  const traceId = match[2];
  const parentId = match[3];
  const flags = match[4];

  if (!version || !traceId || !parentId || !flags) {
    return null;
  }

  // W3C spec: trace-id and parent-id cannot be all zeros
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) {
    return null;
  }

  return {
    version: version.toLowerCase(),
    traceId: traceId.toLowerCase(),
    parentId: parentId.toLowerCase(),
    flags: flags.toLowerCase(),
  };
}

/**
 * Format a W3C traceparent header from traceId, spanId, and flags.
 */
export function formatTraceparent(traceId: string, spanId: string, flags = '01'): string {
  const normTrace = traceId.replace(/-/g, '').padStart(32, '0').slice(0, 32).toLowerCase();
  const normSpan = spanId.replace(/-/g, '').padStart(16, '0').slice(0, 16).toLowerCase();
  return `00-${normTrace}-${normSpan}-${flags}`;
}

/**
 * Abstraction for AsyncLocalStorage that works safely in Node.js
 * and degrades gracefully in browser or non-Node environments.
 */
interface AsyncLocalStorageLike<T> {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
}

let nodeAlsInstance: AsyncLocalStorageLike<CorrelationContext> | null = null;
let nodeAlsChecked = false;

function getNodeAsyncLocalStorage(): AsyncLocalStorageLike<CorrelationContext> | null {
  if (nodeAlsChecked) return nodeAlsInstance;
  nodeAlsChecked = true;

  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const asyncHooks = require('node:async_hooks');
      if (asyncHooks && typeof asyncHooks.AsyncLocalStorage === 'function') {
        const Ctor = asyncHooks.AsyncLocalStorage as new () => AsyncLocalStorageLike<CorrelationContext>;
        nodeAlsInstance = new Ctor();
      }
    } catch {
      // Non-Node or sandbox without async_hooks
    }
  }

  return nodeAlsInstance;
}

/**
 * Manages correlation IDs, session IDs, user IDs, distributed trace
 * contexts (W3C traceparent), parent-child event hierarchies, and
 * asynchronous context propagation.
 */
export class CorrelationManager {
  private correlationId: string | undefined;
  private sessionId: string | undefined;
  private userId: string | undefined;
  private traceId: string | undefined;
  private spanId: string | undefined;
  private parentId: string | undefined;
  private metadata: Record<string, unknown> = {};

  private readonly als: AsyncLocalStorageLike<CorrelationContext> | null;

  constructor() {
    this.als = getNodeAsyncLocalStorage();
  }

  /** Explicitly set the correlation ID. */
  setCorrelationId(id: string): void {
    const store = this.getActiveStore();
    if (store) {
      store.correlationId = id;
    } else {
      this.correlationId = id;
    }
  }

  /**
   * Return the current correlation ID.
   * If none has been set, a new one is generated and cached.
   */
  getCorrelationId(): string {
    const store = this.getActiveStore();
    if (store) {
      if (!store.correlationId) {
        store.correlationId = generateId();
      }
      return store.correlationId;
    }

    if (!this.correlationId) {
      this.correlationId = generateId();
    }
    return this.correlationId;
  }

  /** Set the session ID. */
  setSessionId(id: string): void {
    const store = this.getActiveStore();
    if (store) {
      store.sessionId = id;
    } else {
      this.sessionId = id;
    }
  }

  /** Return the current session ID, or `undefined` if not set. */
  getSessionId(): string | undefined {
    const store = this.getActiveStore();
    return store ? store.sessionId : this.sessionId;
  }

  /** Set the user ID. */
  setUserId(id: string): void {
    const store = this.getActiveStore();
    if (store) {
      store.userId = id;
    } else {
      this.userId = id;
    }
  }

  /** Return the current user ID, or `undefined` if not set. */
  getUserId(): string | undefined {
    const store = this.getActiveStore();
    return store ? store.userId : this.userId;
  }

  /** Set the active distributed trace ID (32-hex). */
  setTraceId(id: string): void {
    const store = this.getActiveStore();
    if (store) {
      store.traceId = id;
    } else {
      this.traceId = id;
    }
  }

  /** Return the current trace ID, or generate one if unset. */
  getTraceId(): string {
    const store = this.getActiveStore();
    if (store) {
      if (!store.traceId) {
        store.traceId = generateTraceId();
      }
      return store.traceId;
    }

    if (!this.traceId) {
      this.traceId = generateTraceId();
    }
    return this.traceId;
  }

  /** Set the active span ID (16-hex). */
  setSpanId(id: string): void {
    const store = this.getActiveStore();
    if (store) {
      store.spanId = id;
    } else {
      this.spanId = id;
    }
  }

  /** Return the current span ID, or generate one if unset. */
  getSpanId(): string {
    const store = this.getActiveStore();
    if (store) {
      if (!store.spanId) {
        store.spanId = generateSpanId();
      }
      return store.spanId;
    }

    if (!this.spanId) {
      this.spanId = generateSpanId();
    }
    return this.spanId;
  }

  /** Set the parent span/event ID for hierarchical tracking. */
  setParentId(id: string | undefined): void {
    const store = this.getActiveStore();
    if (store) {
      store.parentId = id;
    } else {
      this.parentId = id;
    }
  }

  /** Return the current parent ID, or `undefined` if root. */
  getParentId(): string | undefined {
    const store = this.getActiveStore();
    return store ? store.parentId : this.parentId;
  }

  /**
   * Set correlation, trace, and parent IDs from an incoming W3C traceparent header.
   * Returns `true` if successfully parsed, `false` otherwise.
   */
  setTraceparent(header: string): boolean {
    const parsed = parseTraceparent(header);
    if (!parsed) return false;

    this.setTraceId(parsed.traceId);
    this.setParentId(parsed.parentId);
    this.setSpanId(generateSpanId());
    return true;
  }

  /**
   * Format the current trace context as a W3C traceparent header string.
   */
  getTraceparent(flags = '01'): string {
    return formatTraceparent(this.getTraceId(), this.getSpanId(), flags);
  }

  /**
   * Create a child span context under the current span.
   */
  createChildSpan(): { traceId: string; spanId: string; parentId: string } {
    const traceId = this.getTraceId();
    const parentId = this.getSpanId();
    const childSpanId = generateSpanId();

    return {
      traceId,
      spanId: childSpanId,
      parentId,
    };
  }

  /** Attach metadata to the correlation context. */
  setMetadata(key: string, value: unknown): void {
    const store = this.getActiveStore();
    if (store) {
      store.metadata = { ...(store.metadata ?? {}), [key]: value };
    } else {
      this.metadata = { ...this.metadata, [key]: value };
    }
  }

  /** Get all correlation metadata. */
  getMetadata(): Record<string, unknown> {
    const store = this.getActiveStore();
    return store ? { ...(store.metadata ?? {}) } : { ...this.metadata };
  }

  /** Clear all correlation metadata. */
  clearMetadata(): void {
    const store = this.getActiveStore();
    if (store) {
      store.metadata = {};
    } else {
      this.metadata = {};
    }
  }

  /**
   * Build a context snapshot containing all current identifiers and metadata.
   */
  createContext(): CorrelationContext {
    const store = this.getActiveStore();
    if (store) {
      return {
        correlationId: store.correlationId ?? this.getCorrelationId(),
        sessionId: store.sessionId ?? this.sessionId,
        userId: store.userId ?? this.userId,
        traceId: store.traceId ?? this.traceId,
        spanId: store.spanId ?? this.spanId,
        parentId: store.parentId ?? this.parentId,
        metadata: { ...this.metadata, ...(store.metadata ?? {}) },
      };
    }

    const ctx: CorrelationContext = {
      correlationId: this.getCorrelationId(),
    };

    if (this.sessionId !== undefined) ctx.sessionId = this.sessionId;
    if (this.userId !== undefined) ctx.userId = this.userId;
    if (this.traceId !== undefined) ctx.traceId = this.traceId;
    if (this.spanId !== undefined) ctx.spanId = this.spanId;
    if (this.parentId !== undefined) ctx.parentId = this.parentId;
    if (Object.keys(this.metadata).length > 0) ctx.metadata = { ...this.metadata };

    return ctx;
  }

  /**
   * Execute a function within an asynchronous context scope (powered by
   * Node.js AsyncLocalStorage when available).
   *
   * Child tasks, async await calls, and nested tracker invocations inside
   * `callback` will automatically inherit this context.
   */
  runWithContext<R>(context: Partial<CorrelationContext>, callback: () => R): R {
    const baseContext = this.createContext();
    const resolvedContext: CorrelationContext = {
      correlationId: context.correlationId ?? baseContext.correlationId,
      sessionId: context.sessionId ?? baseContext.sessionId,
      userId: context.userId ?? baseContext.userId,
      traceId: context.traceId ?? baseContext.traceId ?? generateTraceId(),
      spanId: context.spanId ?? generateSpanId(),
      parentId: context.parentId ?? baseContext.spanId,
      metadata: { ...baseContext.metadata, ...(context.metadata ?? {}) },
    };

    if (this.als) {
      return this.als.run(resolvedContext, callback);
    }

    // Fallback when ALS is unavailable: execute synchronously with state swap
    const prevCorrelation = this.correlationId;
    const prevSession = this.sessionId;
    const prevUser = this.userId;
    const prevTrace = this.traceId;
    const prevSpan = this.spanId;
    const prevParent = this.parentId;
    const prevMetadata = this.metadata;

    this.correlationId = resolvedContext.correlationId;
    this.sessionId = resolvedContext.sessionId;
    this.userId = resolvedContext.userId;
    this.traceId = resolvedContext.traceId;
    this.spanId = resolvedContext.spanId;
    this.parentId = resolvedContext.parentId;
    this.metadata = resolvedContext.metadata ?? {};

    try {
      return callback();
    } finally {
      this.correlationId = prevCorrelation;
      this.sessionId = prevSession;
      this.userId = prevUser;
      this.traceId = prevTrace;
      this.spanId = prevSpan;
      this.parentId = prevParent;
      this.metadata = prevMetadata;
    }
  }

  /** Reset all identifiers to their unset state. */
  reset(): void {
    this.correlationId = undefined;
    this.sessionId = undefined;
    this.userId = undefined;
    this.traceId = undefined;
    this.spanId = undefined;
    this.parentId = undefined;
    this.metadata = {};
  }

  private getActiveStore(): CorrelationContext | undefined {
    return this.als ? this.als.getStore() : undefined;
  }
}
