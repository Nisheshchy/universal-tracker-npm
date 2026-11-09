import type { TrackerEvent, EventFilter } from '../types/index.js';

export interface StorageAdapter {
  initialize(): Promise<void>;
  save(event: TrackerEvent): Promise<void>;
  saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void>;
  query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Validate that a custom storage adapter implements all required lifecycle methods.
 * Returns an array of missing method names (empty array if valid).
 */
export function validateStorageAdapter(adapter: unknown): string[] {
  const missing: string[] = [];

  if (!adapter || typeof adapter !== 'object') {
    return ['StorageAdapter must be an object or class instance'];
  }

  const requiredMethods: Array<keyof StorageAdapter> = [
    'initialize',
    'save',
    'saveMany',
    'query',
    'flush',
    'close',
  ];

  const obj = adapter as Record<string, unknown>;

  for (const method of requiredMethods) {
    if (typeof obj[method] !== 'function') {
      missing.push(`Missing required method: ${method}()`);
    }
  }

  return missing;
}
