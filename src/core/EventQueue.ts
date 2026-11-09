import type { TrackerEvent, QueueConfig, EventBatchConfig } from '../types/index.js';
import { EventProcessor } from './EventProcessor.js';
import { Logger } from './Logger.js';

/** Resolved queue configuration with guaranteed defaults. */
interface ResolvedQueueConfig {
  readonly maxSize: number;
  readonly dropPolicy: 'oldest' | 'newest';
  readonly batchSize: number;
}

/**
 * Bounded event queue with batching and automatic flushing support.
 *
 * Events are enqueued and held until a flush is triggered — either
 * manually or via `startAutoFlush`. On flush, events are dispatched
 * to the `EventProcessor` in configurable batch sizes.
 */
export class EventQueue {
  private readonly queue: TrackerEvent[] = [];
  private readonly resolvedConfig: ResolvedQueueConfig;
  private readonly processor: EventProcessor;
  private readonly logger: Logger;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    config: QueueConfig & Partial<EventBatchConfig>,
    processor: EventProcessor,
    logger: Logger,
  ) {
    this.processor = processor;
    this.logger = logger;

    this.resolvedConfig = {
      maxSize: config.maxSize ?? 10_000,
      dropPolicy: config.dropPolicy ?? 'oldest',
      batchSize: Math.min(config.maxSize ?? 50, 100),
    };

    if (this.resolvedConfig.maxSize <= 0) {
      throw new Error('EventQueue: maxSize must be greater than 0');
    }
  }

  /**
   * Add an event to the queue.
   *
   * When the queue is at capacity the configured `dropPolicy` applies:
   * - `'oldest'` — the oldest event (front) is dropped to make room.
   * - `'newest'` — the incoming event is rejected.
   */
  enqueue(event: TrackerEvent): void {
    if (this.queue.length >= this.resolvedConfig.maxSize) {
      if (this.resolvedConfig.dropPolicy === 'newest') {
        this.logger.warn(
          `Queue full (${this.resolvedConfig.maxSize}). Dropping newest event '${event.id}'.`,
        );
        return;
      }

      // dropPolicy === 'oldest'
      const dropped = this.queue.shift();
      this.logger.warn(
        `Queue full (${this.resolvedConfig.maxSize}). Dropping oldest event '${dropped?.id ?? 'unknown'}'.`,
      );
    }

    this.queue.push(event);
    this.logger.debug(`Event '${event.id}' enqueued. Queue size: ${this.queue.length}`);
  }

  /**
   * Process all queued events in batches.
   *
   * This method is re-entrant safe — concurrent calls are coalesced
   * so that only one flush runs at a time.
   */
  async flush(): Promise<void> {
    if (this.flushing) {
      this.logger.debug('Flush already in progress — skipping');
      return;
    }

    this.flushing = true;

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.resolvedConfig.batchSize);
        this.logger.debug(`Flushing batch of ${batch.length} events`);
        await this.processor.processBatch(batch);
      }
    } catch (err) {
      this.logger.error('Error during queue flush', err);
    } finally {
      this.flushing = false;
    }
  }

  /** Return the current number of events in the queue. */
  size(): number {
    return this.queue.length;
  }

  /** Remove all events from the queue without processing them. */
  clear(): void {
    this.queue.length = 0;
    this.logger.debug('Queue cleared');
  }

  /**
   * Start a periodic flush interval.
   *
   * @param intervalMs  Milliseconds between automatic flushes.
   */
  startAutoFlush(intervalMs: number): void {
    if (this.flushTimer !== null) {
      this.logger.warn('Auto-flush is already running — stopping previous timer');
      this.stopAutoFlush();
    }

    if (intervalMs <= 0) {
      throw new Error('EventQueue: auto-flush interval must be greater than 0');
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, intervalMs);

    // Allow the Node.js process to exit even if the timer is active
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }

    this.logger.info(`Auto-flush started with interval ${intervalMs}ms`);
  }

  /** Stop the periodic auto-flush timer. */
  stopAutoFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
      this.logger.info('Auto-flush stopped');
    }
  }
}
