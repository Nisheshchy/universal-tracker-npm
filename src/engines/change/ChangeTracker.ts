import type { EventBus } from '../../core/EventBus.js';
import type { Logger } from '../../core/Logger.js';
import type { TrackerConfig, TrackerEvent, ChangeEventData } from '../../types/index.js';
import { generateId } from '../../utils/generateId.js';
import { isoTimestamp } from '../../utils/time.js';
import { ObjectComparator, type PropertyDiff, type ComparisonOptions } from './ObjectComparator.js';
import { SnapshotManager, type SnapshotEntry } from './SnapshotManager.js';
import { ChangeHistory, type ChangeHistoryEntry } from './ChangeHistory.js';

export interface ChangeTrackerOptions {
  readonly ignoredProperties?: readonly string[];
  readonly maxHistoryPerEntity?: number;
  readonly maxSnapshots?: number;
  readonly maxDepth?: number;
}

export class ChangeTracker {
  private readonly comparator: ObjectComparator;
  private readonly snapshotManager: SnapshotManager;
  private readonly historyManager: ChangeHistory;
  private readonly ignoredProperties: string[];
  private readonly eventBus?: EventBus;
  private readonly logger?: Logger;
  private readonly config?: TrackerConfig;

  constructor(
    options?: ChangeTrackerOptions,
    dependencies?: {
      eventBus?: EventBus;
      logger?: Logger;
      config?: TrackerConfig;
    },
  ) {
    this.comparator = new ObjectComparator(options?.maxDepth ?? 30);
    this.snapshotManager = new SnapshotManager(options?.maxSnapshots ?? 1000);
    this.historyManager = new ChangeHistory(options?.maxHistoryPerEntity ?? 100);
    this.ignoredProperties = [...(options?.ignoredProperties ?? [])];
    this.eventBus = dependencies?.eventBus;
    this.logger = dependencies?.logger;
    this.config = dependencies?.config;
  }

  /**
   * Compare two objects and produce an array of property diffs.
   */
  compare(
    before: unknown,
    after: unknown,
    options?: ComparisonOptions,
  ): PropertyDiff[] {
    const combinedIgnored = [
      ...this.ignoredProperties,
      ...(options?.ignoredProperties ?? []),
    ];
    return this.comparator.compare(before, after, {
      ...options,
      ignoredProperties: combinedIgnored,
    });
  }

  /**
   * Save a snapshot of an entity's current state.
   */
  snapshot(entity: string, data: unknown): SnapshotEntry {
    return this.snapshotManager.snapshot(entity, data);
  }

  /**
   * Retrieve the snapshot for an entity.
   */
  getSnapshot(entity: string): SnapshotEntry | undefined {
    return this.snapshotManager.get(entity);
  }

  /**
   * Retrieve change history for an entity.
   */
  history(entity: string, limit?: number): ChangeHistoryEntry[] {
    return this.historyManager.get(entity, limit);
  }

  /**
   * Track changes to an entity against its previous snapshot.
   * If no previous snapshot exists, creates the initial snapshot and returns an empty diff array.
   * If a previous snapshot exists, compares, records history, emits change events, and updates the snapshot.
   */
  track(
    entity: string,
    currentData: unknown,
    metadata?: Record<string, unknown>,
  ): PropertyDiff[] {
    const previousSnapshot = this.snapshotManager.get(entity);

    if (!previousSnapshot) {
      this.snapshotManager.snapshot(entity, currentData);
      this.logger?.debug(`[ChangeTracker] Initial snapshot created for entity: ${entity}`);
      return [];
    }

    const diffs = this.compare(previousSnapshot.data, currentData);

    if (diffs.length > 0) {
      const changeId = generateId();
      this.historyManager.add(changeId, entity, diffs, metadata);

      // Emit change events for each property diff
      for (const diff of diffs) {
        const changeData: ChangeEventData = {
          entity,
          property: diff.property,
          before: diff.before,
          after: diff.after,
          changeType: diff.changeType,
          path: diff.path,
        };

        const event: TrackerEvent = {
          id: generateId(),
          type: 'change',
          timestamp: isoTimestamp(),
          appName: this.config?.appName ?? 'app',
          environment: this.config?.environment ?? 'development',
          source: 'ChangeTracker',
          data: {
            ...changeData,
            ...(metadata ? { metadata } : {}),
          },
        };

        this.eventBus?.emit('event:created', event);
      }

      this.logger?.debug(
        `[ChangeTracker] Detected ${diffs.length} change(s) in entity "${entity}"`,
      );
    }

    // Update snapshot with the current state
    this.snapshotManager.snapshot(entity, currentData);

    return diffs;
  }

  /**
   * Watch a local file for changes (Node.js only).
   */
  async watchFile(
    filePath: string,
    handler?: (diffs: PropertyDiff[]) => void,
  ): Promise<{ close: () => Promise<void> }> {
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
      throw new Error('File watching is only supported in Node.js environments.');
    }

    const { FileWatcher } = await import('../../integrations/node/FileWatcher.js');
    const watcher = new FileWatcher(this, this.logger);
    await watcher.watch(filePath, handler);

    return {
      close: async () => {
        await watcher.unwatch(filePath);
      },
    };
  }

  /**
   * Clear all snapshots and history.
   */
  clear(): void {
    this.snapshotManager.clear();
    this.historyManager.clear();
  }
}

