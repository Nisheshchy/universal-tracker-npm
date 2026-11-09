import type { TrackerEvent, EventFilter, StorageAdapter } from '../types/index.js';

/**
 * In-memory storage adapter for TrackerEvent.
 *
 * Stores events in a bounded array, evicting the oldest entries when
 * the capacity limit is reached.  Suitable for development, testing,
 * and short-lived browser sessions where persistence is not required.
 */
export class MemoryStorage implements StorageAdapter {
  private events: TrackerEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 50_000) {
    this.maxEvents = maxEvents;
  }

  /* ------------------------------------------------------------------ */
  /*  StorageAdapter interface                                          */
  /* ------------------------------------------------------------------ */

  /** No-op — memory storage requires no initialisation. */
  async initialize(): Promise<void> {
    // Nothing to initialise for in-memory storage.
  }

  /** Persist a single event, evicting the oldest entry when at capacity. */
  async save(event: TrackerEvent): Promise<void> {
    this.events.push(event);
    this.evictIfNeeded();
  }

  /** Persist multiple events, evicting the oldest entries when at capacity. */
  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> {
    this.events.push(...events);
    this.evictIfNeeded();
  }

  /**
   * Query stored events.
   *
   * Supported filters: `type`, `source`, `userId`, `startTime`, `endTime`.
   * Results are returned in **descending** timestamp order (newest first).
   * Pagination is controlled via `limit` (default 100) and `offset` (default 0).
   */
  async query(filters: EventFilter = {}): Promise<ReadonlyArray<TrackerEvent>> {
    const { type, source, userId, startTime, endTime } = filters;
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    let results = this.events.filter((event) => {
      if (type !== undefined && event.type !== type) return false;
      if (source !== undefined && event.source !== source) return false;
      if (userId !== undefined && event.userId !== userId) return false;
      if (startTime !== undefined && event.timestamp < startTime) return false;
      if (endTime !== undefined && event.timestamp > endTime) return false;
      return true;
    });

    // Sort by timestamp descending (newest first).
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Paginate.
    results = results.slice(offset, offset + limit);

    return results;
  }

  /** No-op — memory storage has nothing to flush to disk. */
  async flush(): Promise<void> {
    // Nothing to flush for in-memory storage.
  }

  /** Clear all stored events and release memory. */
  async close(): Promise<void> {
    this.events = [];
  }

  /* ------------------------------------------------------------------ */
  /*  Convenience helpers                                               */
  /* ------------------------------------------------------------------ */

  /** Return a shallow copy of every stored event. */
  getAll(): TrackerEvent[] {
    return [...this.events];
  }

  /** Return the current number of stored events. */
  count(): number {
    return this.events.length;
  }

  /** Remove all stored events. */
  clear(): void {
    this.events = [];
  }

  /* ------------------------------------------------------------------ */
  /*  Internal                                                          */
  /* ------------------------------------------------------------------ */

  /** Evict the oldest events when the buffer exceeds `maxEvents`. */
  private evictIfNeeded(): void {
    if (this.events.length > this.maxEvents) {
      const overflow = this.events.length - this.maxEvents;
      this.events.splice(0, overflow);
    }
  }
}
