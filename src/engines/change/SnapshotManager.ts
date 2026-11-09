import { deepClone } from '../../utils/deepClone.js';

export interface SnapshotEntry {
  readonly entity: string;
  readonly data: unknown;
  readonly timestamp: string;
}

export class SnapshotManager {
  private readonly snapshots = new Map<string, SnapshotEntry>();
  private readonly maxSnapshots: number;

  constructor(maxSnapshots: number = 1000) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Save a snapshot of the current state of an entity.
   */
  snapshot(entity: string, data: unknown): SnapshotEntry {
    if (this.snapshots.size >= this.maxSnapshots && !this.snapshots.has(entity)) {
      // Evict oldest snapshot (first key in map)
      const oldestKey = this.snapshots.keys().next().value;
      if (oldestKey !== undefined) {
        this.snapshots.delete(oldestKey);
      }
    }

    const entry: SnapshotEntry = {
      entity,
      data: deepClone(data),
      timestamp: new Date().toISOString(),
    };

    this.snapshots.set(entity, entry);
    return entry;
  }

  /**
   * Get the stored snapshot for an entity.
   */
  get(entity: string): SnapshotEntry | undefined {
    return this.snapshots.get(entity);
  }

  /**
   * Check if a snapshot exists for an entity.
   */
  has(entity: string): boolean {
    return this.snapshots.has(entity);
  }

  /**
   * Delete a snapshot for an entity.
   */
  delete(entity: string): boolean {
    return this.snapshots.delete(entity);
  }

  /**
   * Clear all snapshots.
   */
  clear(): void {
    this.snapshots.clear();
  }

  /**
   * Total number of stored snapshots.
   */
  size(): number {
    return this.snapshots.size;
  }
}
