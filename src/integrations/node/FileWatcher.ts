import { readFile } from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import type { ChangeTracker } from '../../engines/change/ChangeTracker.js';
import type { PropertyDiff } from '../../engines/change/ObjectComparator.js';
import type { Logger } from '../../core/Logger.js';

export class FileWatcher {
  private readonly tracker: ChangeTracker;
  private readonly logger?: Logger;
  private readonly activeWatchers = new Map<string, { close: () => Promise<void> }>();
  private readonly fileSnapshots = new Map<string, unknown>();

  constructor(tracker: ChangeTracker, logger?: Logger) {
    this.tracker = tracker;
    this.logger = logger;
  }

  /**
   * Watch a file for modifications and track diffs.
   */
  async watch(
    filePath: string,
    callback?: (diffs: PropertyDiff[]) => void,
  ): Promise<void> {
    if (this.activeWatchers.has(filePath)) {
      return;
    }

    // Initial read and snapshot
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = this.parseContent(content);
      this.fileSnapshots.set(filePath, parsed);
      this.tracker.snapshot(filePath, parsed);
    } catch (err) {
      this.logger?.warn(`[FileWatcher] Failed to read initial file "${filePath}":`, err);
    }

    let isChokidar = false;
    let chokidarWatcher: { close: () => Promise<void> } | undefined;

    try {
      // Try optional chokidar
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const chokidar = require('chokidar');
      if (chokidar && typeof chokidar.watch === 'function') {
        const watcher = chokidar.watch(filePath, { ignoreInitial: true });
        watcher.on('change', async () => {
          await this.handleFileChange(filePath, callback);
        });
        chokidarWatcher = {
          close: async () => {
            await watcher.close();
          },
        };
        isChokidar = true;
      }
    } catch {
      // Fallback to native fs.watch
    }

    if (!isChokidar) {
      let fsWatcher: FSWatcher | null = null;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      try {
        fsWatcher = watch(filePath, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            void this.handleFileChange(filePath, callback);
          }, 100);
        });
      } catch (err) {
        this.logger?.error(`[FileWatcher] Failed to watch file "${filePath}":`, err);
        return;
      }

      this.activeWatchers.set(filePath, {
        close: async () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          fsWatcher?.close();
        },
      });
    } else if (chokidarWatcher) {
      this.activeWatchers.set(filePath, chokidarWatcher);
    }

    this.logger?.info(`[FileWatcher] Watching file "${filePath}"`);
  }

  /**
   * Stop watching a file.
   */
  async unwatch(filePath: string): Promise<void> {
    const watcher = this.activeWatchers.get(filePath);
    if (watcher) {
      await watcher.close();
      this.activeWatchers.delete(filePath);
      this.fileSnapshots.delete(filePath);
      this.logger?.info(`[FileWatcher] Stopped watching file "${filePath}"`);
    }
  }

  /**
   * Close all active watchers.
   */
  async close(): Promise<void> {
    for (const filePath of Array.from(this.activeWatchers.keys())) {
      await this.unwatch(filePath);
    }
  }

  private async handleFileChange(
    filePath: string,
    callback?: (diffs: PropertyDiff[]) => void,
  ): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const current = this.parseContent(content);
      const diffs = this.tracker.track(filePath, current);

      if (diffs.length > 0) {
        this.fileSnapshots.set(filePath, current);
        callback?.(diffs);
      }
    } catch (err) {
      this.logger?.error(`[FileWatcher] Error processing change on "${filePath}":`, err);
    }
  }

  private parseContent(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      return { rawContent: content };
    }
  }
}

