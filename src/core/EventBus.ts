/**
 * Well-known event names emitted by the TrackFlow system.
 *
 * Consumer code can also emit/subscribe to arbitrary custom event names.
 */
export const BUILT_IN_EVENTS = {
  EVENT_CREATED: 'event:created',
  EVENT_PROCESSED: 'event:processed',
  EVENT_ERROR: 'event:error',
  TRACKER_START: 'tracker:start',
  TRACKER_STOP: 'tracker:stop',
  ENGINE_ERROR: 'engine:error',
} as const;

/** Union of built-in event name literals. */
export type BuiltInEvent = (typeof BUILT_IN_EVENTS)[keyof typeof BUILT_IN_EVENTS];

/** Callback signature used by the EventBus. */
export type EventHandler = (...args: unknown[]) => void | Promise<void>;

/**
 * A typed, synchronous/asynchronous publish-subscribe event bus.
 *
 * Handlers are stored per-event in a `Map<string, Set<EventHandler>>`.
 * `emit` fires handlers synchronously (fire-and-forget), while
 * `emitAsync` awaits every handler before resolving.
 */
export class EventBus {
  private readonly listeners = new Map<string, Set<EventHandler>>();

  /** Register a handler for a given event name. */
  on(event: string, handler: EventHandler): void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set<EventHandler>();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
  }

  /** Remove a specific handler for a given event name. */
  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event synchronously.
   *
   * All registered handlers are invoked in registration order.
   * If a handler throws, the error is caught and re-thrown after all
   * handlers have been called so that one failing handler does not
   * prevent the rest from executing.
   */
  emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    const errors: unknown[] = [];
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `EventBus: ${errors.length} handler(s) threw during '${event}'`,
      );
    }
  }

  /**
   * Emit an event and await all handlers (including those that return Promises).
   *
   * Handlers are executed concurrently via `Promise.allSettled` so that
   * one failing handler does not prevent the others from completing.
   */
  async emitAsync(event: string, ...args: unknown[]): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    const results = await Promise.allSettled(
      [...handlers].map((handler) => Promise.resolve(handler(...args))),
    );

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason as unknown);

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `EventBus: ${errors.length} handler(s) threw during async '${event}'`,
      );
    }
  }

  /**
   * Remove all listeners for a specific event, or for *all* events
   * when called without arguments.
   */
  removeAllListeners(event?: string): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Return the number of registered handlers for a given event. */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

