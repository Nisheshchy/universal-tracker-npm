import { mkdir, appendFile, readFile, writeFile, rename, stat } from 'fs/promises';
import { dirname } from 'path';
import { fdatasync, openSync, closeSync } from 'fs';
import type { TrackerEvent, EventFilter, StorageAdapter } from '../types/index.js';

/** Configuration options for {@link FileStorage}. */
export interface FileStorageOptions {
  /** When `true`, each JSON line is pretty-printed (one object per logical line is still maintained). */
  pretty?: boolean;
  /**
   * Maximum file size in bytes before automatic rotation.
   * Defaults to 10 MB.  Set to `0` or `Infinity` to disable rotation.
   */
  maxFileSize?: number;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * File-based storage adapter (Node.js only).
 *
 * Events are persisted as **newline-delimited JSON** (NDJSON).  When the file
 * exceeds `maxFileSize` bytes the current file is renamed to `<name>.backup`
 * and a fresh file is started.
 */
export class FileStorage implements StorageAdapter {
  private readonly filePath: string;
  private readonly pretty: boolean;
  private readonly maxFileSize: number;

  constructor(filePath: string, options: FileStorageOptions = {}) {
    this.filePath = filePath;
    this.pretty = options.pretty ?? false;
    this.maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  /* ------------------------------------------------------------------ */
  /*  StorageAdapter interface                                          */
  /* ------------------------------------------------------------------ */

  /** Ensure the target directory exists and create the file if it does not. */
  async initialize(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    try {
      await stat(this.filePath);
    } catch {
      // File does not exist — create an empty one.
      await writeFile(this.filePath, '', { encoding: 'utf-8' });
    }
  }

  /** Append a single event as an NDJSON line. */
  async save(event: TrackerEvent): Promise<void> {
    await this.rotateIfNeeded();
    const line = this.serialise(event);
    await appendFile(this.filePath, line, { encoding: 'utf-8' });
  }

  /** Append multiple events as NDJSON lines in a single write. */
  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> {
    if (events.length === 0) return;
    await this.rotateIfNeeded();
    const lines = events.map((e) => this.serialise(e)).join('');
    await appendFile(this.filePath, lines, { encoding: 'utf-8' });
  }

  /**
   * Read and filter events from the NDJSON file.
   *
   * Supports the same filter fields as {@link MemoryStorage.query}.
   */
  async query(filters: EventFilter = {}): Promise<ReadonlyArray<TrackerEvent>> {
    const { type, source, userId, startTime, endTime } = filters;
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const events = await this.readAllEvents();

    let results = events.filter((event) => {
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

  /** Force an `fdatasync` so buffered data is written to the underlying device. */
  async flush(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let fd: number | undefined;
      try {
        fd = openSync(this.filePath, 'r');
        fdatasync(fd, (err) => {
          if (fd !== undefined) closeSync(fd);
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (error: unknown) {
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {
            // Swallow close errors during error handling.
          }
        }
        reject(error);
      }
    });
  }

  /** No-op — there is no persistent connection to tear down. */
  async close(): Promise<void> {
    // Nothing to close for file-based storage.
  }

  /* ------------------------------------------------------------------ */
  /*  Internal helpers                                                  */
  /* ------------------------------------------------------------------ */

  /** Serialise an event to a single NDJSON line (with trailing newline). */
  private serialise(event: TrackerEvent): string {
    const json = this.pretty
      ? JSON.stringify(event, null, 2)
      : JSON.stringify(event);
    return json + '\n';
  }

  /** Read and parse every event from the NDJSON file. */
  private async readAllEvents(): Promise<TrackerEvent[]> {
    let content: string;
    try {
      content = await readFile(this.filePath, { encoding: 'utf-8' });
    } catch {
      return [];
    }

    if (content.trim().length === 0) return [];

    const events: TrackerEvent[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        events.push(JSON.parse(trimmed) as TrackerEvent);
      } catch {
        // Skip malformed lines — log files can contain partial writes.
      }
    }

    return events;
  }

  /**
   * Rotate the file when it exceeds {@link maxFileSize}.
   *
   * The current file is renamed to `<path>.backup` (overwriting any
   * previous backup) and a fresh, empty file is created.
   */
  private async rotateIfNeeded(): Promise<void> {
    if (this.maxFileSize === 0 || this.maxFileSize === Infinity) return;

    try {
      const fileStat = await stat(this.filePath);
      if (fileStat.size >= this.maxFileSize) {
        const backupPath = this.filePath + '.backup';
        await rename(this.filePath, backupPath);
        await writeFile(this.filePath, '', { encoding: 'utf-8' });
      }
    } catch {
      // If stat fails the file likely does not exist yet — nothing to rotate.
    }
  }
}
