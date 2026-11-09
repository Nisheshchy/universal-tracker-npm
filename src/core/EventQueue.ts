import type {
  TrackerEvent,
  QueueConfig,
  EventBatchConfig,
  EventPriority,
} from '../types/index.js';
import { EventProcessor } from './EventProcessor.js';
import { Logger } from './Logger.js';
import type { OfflineBuffer } from './OfflineBuffer.js';

export class QueueOverflowError extends Error {
  readonly capacity: number;
  readonly droppedEventId: string;

  constructor(capacity: number, droppedEventId: string) {
    super(`Queue overflow: capacity of ${capacity} events reached. Event '${droppedEventId}' rejected.`);
    this.name = 'QueueOverflowError';
    this.capacity = capacity;
    this.droppedEventId = droppedEventId;
  }
}

/** Resolved queue configuration with guaranteed defaults. */
interface ResolvedQueueConfig {
  readonly maxSize: number;
  readonly dropPolicy: 'oldest' | 'newest' | 'reject';
  readonly batchSize: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
}

function priorityWeight(priority?: EventPriority): number {
  switch (priority) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'normal':
      return 2;
    case 'low':
      return 1;
    default:
      return 2;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded event queue with priority scheduling, batching, exponential backoff
 * retries, and offline buffer integration.
 */
export class EventQueue {
  private readonly queue: TrackerEvent[] = [];
  private readonly resolvedConfig: ResolvedQueueConfig;
  private readonly processor: EventProcessor;
  private readonly logger: Logger;
  private offlineBuffer?: OfflineBuffer;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  // Internal metrics
  private enqueuedCount = 0;
  private droppedCount = 0;
  private flushCount = 0;
  private flushErrorCount = 0;
  private totalFlushDurationMs = 0;

  constructor(
    config: QueueConfig & Partial<EventBatchConfig>,
    processor: EventProcessor,
    logger: Logger,
    offlineBuffer?: OfflineBuffer,
  ) {
    this.processor = processor;
    this.logger = logger;
    this.offlineBuffer = offlineBuffer;

    this.resolvedConfig = {
      maxSize: config.maxSize ?? 10_000,
      dropPolicy: config.dropPolicy ?? 'oldest',
      batchSize: Math.min(config.maxSize ?? 50, 100),
      maxRetries: config.maxRetries ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 50,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 1_000,
    };

    if (this.resolvedConfig.maxSize <= 0) {
      throw new Error('EventQueue: maxSize must be greater than 0');
    }
  }

  /** Set or update the offline buffer reference. */
  setOfflineBuffer(offlineBuffer: OfflineBuffer): void {
    this.offlineBuffer = offlineBuffer;
  }

  /**
   * Add an event to the queue with priority handling and backpressure enforcement.
   *
   * When capacity is reached:
   * - `'reject'` — throws {@link QueueOverflowError}.
   * - `'newest'` — drops the incoming event.
   * - `'oldest'` — discards the head of the queue.
   */
  enqueue(event: TrackerEvent): void {
    if (this.queue.length >= this.resolvedConfig.maxSize) {
      if (this.resolvedConfig.dropPolicy === 'reject') {
        this.droppedCount++;
        throw new QueueOverflowError(this.resolvedConfig.maxSize, event.id);
      }

      if (this.resolvedConfig.dropPolicy === 'newest') {
        this.droppedCount++;
        this.logger.warn(
          `Queue full (${this.resolvedConfig.maxSize}). Dropping newest event '${event.id}'.`,
        );
        return;
      }

      // dropPolicy === 'oldest'
      const dropped = this.queue.shift();
      this.droppedCount++;
      this.logger.warn(
        `Queue full (${this.resolvedConfig.maxSize}). Dropping oldest event '${dropped?.id ?? 'unknown'}'.`,
      );
    }

    const weight = priorityWeight(event.priority);

    // Insert according to priority (higher weights towards the front)
    let insertIndex = 0;
    while (
      insertIndex < this.queue.length &&
      priorityWeight(this.queue[insertIndex]?.priority) >= weight
    ) {
      insertIndex++;
    }
    this.queue.splice(insertIndex, 0, event);

    this.enqueuedCount++;
    this.logger.debug(`Event '${event.id}' enqueued. Queue size: ${this.queue.length}`);
  }

  /**
   * Process all queued events in batches with retry and offline fallback.
   * Concurrent invocations are coalesced safely.
   */
  async flush(): Promise<void> {
    if (this.flushing) {
      this.logger.debug('Flush already in progress — skipping');
      return;
    }

    this.flushing = true;
    const startTime = Date.now();

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.resolvedConfig.batchSize);
        this.logger.debug(`Flushing batch of ${batch.length} events`);
        await this.dispatchBatchWithRetry(batch);
      }
    } catch (err) {
      this.flushErrorCount++;
      this.logger.error('Error during queue flush', err);
    } finally {
      this.flushCount++;
      this.totalFlushDurationMs += Date.now() - startTime;
      this.flushing = false;
    }
  }

  /**
   * Dispatch a batch to the processor with exponential backoff retries.
   * If all retries are exhausted, divert the batch to the offline buffer.
   */
  private async dispatchBatchWithRetry(batch: TrackerEvent[]): Promise<void> {
    let attempt = 0;
    const maxRetries = this.resolvedConfig.maxRetries;

    while (attempt <= maxRetries) {
      try {
        await this.processor.processBatch(batch);
        return;
      } catch (err) {
        attempt++;
        this.flushErrorCount++;
        this.logger.warn(
          `Batch processing failed (attempt ${attempt}/${maxRetries + 1}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );

        if (attempt <= maxRetries) {
          const delay = Math.min(
            this.resolvedConfig.retryMaxDelayMs,
            this.resolvedConfig.retryBaseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 20,
          );
          await sleep(delay);
        } else {
          // Retries exhausted: divert to offline buffer if available
          if (this.offlineBuffer) {
            this.logger.warn(
              `Batch of ${batch.length} events diverted to OfflineBuffer after ${maxRetries} failed retries.`,
            );
            this.offlineBuffer.pushMany(batch);
          } else {
            this.logger.error(
              `Batch of ${batch.length} events dropped: retries exhausted and no OfflineBuffer configured.`,
            );
            this.droppedCount += batch.length;
          }
        }
      }
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

  /** Get internal operational metrics. */
  getMetrics(): {
    enqueued: number;
    dropped: number;
    flushCount: number;
    flushErrors: number;
    avgFlushDurationMs: number;
  } {
    return {
      enqueued: this.enqueuedCount,
      dropped: this.droppedCount,
      flushCount: this.flushCount,
      flushErrors: this.flushErrorCount,
      avgFlushDurationMs:
        this.flushCount > 0 ? this.totalFlushDurationMs / this.flushCount : 0,
    };
  }

  /**
   * Start a periodic flush interval.
   *
   * @param intervalMs Milliseconds between automatic flushes.
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
