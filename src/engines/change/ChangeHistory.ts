import type { PropertyDiff } from './ObjectComparator.js';

export interface ChangeHistoryEntry {
  readonly id: string;
  readonly entity: string;
  readonly timestamp: string;
  readonly diffs: readonly PropertyDiff[];
  readonly metadata?: Record<string, unknown>;
}

export class ChangeHistory {
  private readonly history = new Map<string, ChangeHistoryEntry[]>();
  private readonly maxEntriesPerEntity: number;
  private readonly maxEntities: number;

  constructor(maxEntriesPerEntity: number = 100, maxEntities: number = 500) {
    this.maxEntriesPerEntity = maxEntriesPerEntity;
    this.maxEntities = maxEntities;
  }

  /**
   * Append a change entry to an entity's history.
   */
  add(
    id: string,
    entity: string,
    diffs: readonly PropertyDiff[],
    metadata?: Record<string, unknown>,
  ): ChangeHistoryEntry {
    let list = this.history.get(entity);
    if (!list) {
      if (this.history.size >= this.maxEntities) {
        const oldest = this.history.keys().next().value;
        if (oldest !== undefined) {
          this.history.delete(oldest);
        }
      }
      list = [];
      this.history.set(entity, list);
    }
    const entry: ChangeHistoryEntry = {
      id,
      entity,
      timestamp: new Date().toISOString(),
      diffs,
      metadata,
    };

    list.unshift(entry); // newest first

    if (list.length > this.maxEntriesPerEntity) {
      list.pop();
    }

    return entry;
  }

  /**
   * Retrieve change history for an entity.
   */
  get(entity: string, limit?: number): ChangeHistoryEntry[] {
    const list = this.history.get(entity) ?? [];
    return limit !== undefined ? list.slice(0, limit) : [...list];
  }

  /**
   * Clear history for a specific entity or all entities.
   */
  clear(entity?: string): void {
    if (entity !== undefined) {
      this.history.delete(entity);
    } else {
      this.history.clear();
    }
  }

  /**
   * Get all tracked entities in history.
   */
  entities(): string[] {
    return Array.from(this.history.keys());
  }
}
