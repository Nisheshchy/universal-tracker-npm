/**
 * Storage abstraction layer for the TrackFlow tracking system.
 *
 * Consumers implement {@link StorageAdapter} to persist events to any
 * backend (in-memory, filesystem, database, cloud, etc.).
 */

import type { TrackerEvent, EventFilter } from './events';

/** Supported built-in storage backends. */
export type StorageType = 'memory' | 'file' | 'custom';

/** Declarative storage configuration. */
export interface StorageConfig {
  /** The backend type to use. */
  readonly type: StorageType;

  /** Backend-specific options (connection strings, paths, etc.). */
  readonly options?: Record<string, unknown>;
}

/**
 * Contract that every storage backend must fulfil.
 *
 * Lifecycle: `initialize()` → (`save` / `saveMany` / `query`) → `flush()` → `close()`.
 */
export interface StorageAdapter {
  /**
   * Perform any async setup (open connections, create directories, etc.).
   * Must be called before any other method.
   */
  initialize(): Promise<void>;

  /** Persist a single event. */
  save(event: TrackerEvent): Promise<void>;

  /** Persist a batch of events atomically where possible. */
  saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void>;

  /** Query persisted events matching the supplied filters. */
  query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>>;

  /** Flush any buffered writes to durable storage. */
  flush(): Promise<void>;

  /** Release resources (close connections, file handles, etc.). */
  close(): Promise<void>;
}
