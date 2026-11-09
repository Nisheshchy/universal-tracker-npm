import type { TrackerEvent, StorageAdapter } from '../types/index.js';
import type { Logger } from './Logger.js';

export interface OfflineBufferOptions {
  /** Maximum number of events the offline buffer can hold before dropping. */
  readonly maxCapacity?: number;
  /** Maximum retry attempts for a single event before marking it dead-letter. */
  readonly maxRetriesPerEvent?: number;
}

interface BufferedRecord {
  readonly event: TrackerEvent;
  retries: number;
  readonly firstBufferedAt: number;
}

/**
 * Manages offline / transient failure event buffering.
 *
 * When the active storage adapter fails to persist events (e.g. network disconnect,
 * database downtime, filesystem locks), events are diverted to the offline buffer.
 * When storage recovers, events are drained in FIFO order back to the storage adapter.
 *
 * Memory safety guarantees:
 * - Strictly bounded capacity (`maxCapacity`, default 5,000).
 * - Poison-pill elimination: events that repeatedly fail are diverted to a
 *   dead-letter count and dropped to prevent blocking the buffer.
 */
export class OfflineBuffer {
  private readonly buffer: BufferedRecord[] = [];
  private readonly maxCapacity: number;
  private readonly maxRetriesPerEvent: number;
  private readonly logger: Logger;
  private deadLetterCount = 0;
  private draining = false;

  constructor(logger: Logger, options?: OfflineBufferOptions) {
    this.logger = logger;
    this.maxCapacity = options?.maxCapacity ?? 5_000;
    this.maxRetriesPerEvent = options?.maxRetriesPerEvent ?? 3;
  }

  /**
   * Buffer an event that failed to be stored.
   */
  push(event: TrackerEvent): void {
    if (this.buffer.length >= this.maxCapacity) {
      const dropped = this.buffer.shift();
      this.deadLetterCount++;
      this.logger.warn(
        `OfflineBuffer capacity reached (${this.maxCapacity}). Dropped oldest event '${dropped?.event.id}'.`,
      );
    }

    this.buffer.push({
      event,
      retries: 0,
      firstBufferedAt: Date.now(),
    });

    this.logger.debug(
      `Event '${event.id}' buffered in OfflineBuffer. Current offline size: ${this.buffer.length}`,
    );
  }

  /**
   * Buffer multiple events simultaneously.
   */
  pushMany(events: readonly TrackerEvent[]): void {
    for (const event of events) {
      this.push(event);
    }
  }

  /**
   * Drain buffered events to the storage adapter in FIFO order.
   *
   * @param storage The destination storage adapter.
   * @returns Number of events successfully recovered and saved.
   */
  async drain(storage: StorageAdapter): Promise<number> {
    if (this.draining || this.buffer.length === 0) {
      return 0;
    }

    this.draining = true;
    let savedCount = 0;

    try {
      while (this.buffer.length > 0) {
        const item = this.buffer[0];
        if (!item) break;

        try {
          await storage.save(item.event);
          // Successfully saved, remove from front of buffer
          this.buffer.shift();
          savedCount++;
        } catch (err) {
          item.retries++;
          this.logger.warn(
            `Failed to drain offline event '${item.event.id}' (attempt ${item.retries}/${this.maxRetriesPerEvent})`,
            err,
          );

          if (item.retries >= this.maxRetriesPerEvent) {
            // Poison-pill protection: drop from buffer to prevent infinite failure
            this.buffer.shift();
            this.deadLetterCount++;
            this.logger.error(
              `Offline event '${item.event.id}' exceeded max retries. Moved to dead-letter.`,
            );
          } else {
            // Storage is likely still down; stop draining this cycle
            break;
          }
        }
      }
    } finally {
      this.draining = false;
    }

    if (savedCount > 0) {
      this.logger.info(`Successfully drained ${savedCount} events from OfflineBuffer.`);
    }

    return savedCount;
  }

  /** Current number of events held in the buffer. */
  size(): number {
    return this.buffer.length;
  }

  /** Total count of events dropped or marked dead-letter. */
  getDeadLetters(): number {
    return this.deadLetterCount;
  }

  /** Clear the buffer without saving. */
  clear(): void {
    this.buffer.length = 0;
    this.deadLetterCount = 0;
  }
}
