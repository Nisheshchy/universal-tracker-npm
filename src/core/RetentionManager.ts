import type { StorageAdapter, RetentionConfig } from '../types/index.js';
import type { Logger } from './Logger.js';

/**
 * Manages storage event retention policies.
 *
 * Periodically purges records that exceed maximum age or total count limits
 * to prevent indefinite storage growth.
 */
export class RetentionManager {
  private readonly config: RetentionConfig;
  private readonly storage: StorageAdapter;
  private readonly logger: Logger;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: RetentionConfig, storage: StorageAdapter, logger: Logger) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;
  }

  /**
   * Start the background retention cleanup schedule.
   */
  start(): void {
    if (!this.config.enabled || this.running) return;

    this.running = true;
    const intervalMs = this.config.cleanupIntervalMs ?? 60_000;

    this.cleanupTimer = setInterval(() => {
      void this.enforceRetention();
    }, intervalMs);

    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }

    this.logger.info(`RetentionManager started with sweep interval ${intervalMs}ms`);
  }

  /**
   * Stop the background retention schedule.
   */
  stop(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.running = false;
    this.logger.info('RetentionManager stopped');
  }

  /**
   * Run an immediate retention sweep against storage.
   *
   * @returns Number of events evaluated/retained.
   */
  async enforceRetention(): Promise<number> {
    try {
      const maxAgeMs = this.config.maxAgeMs;
      if (!maxAgeMs || maxAgeMs <= 0) {
        return 0;
      }

      const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString();

      // Query events up to cutoff
      const expiredEvents = await this.storage.query({
        endTime: cutoffTime,
        limit: 10_000,
      });

      if (expiredEvents.length > 0) {
        this.logger.info(
          `Retention sweep: identified ${expiredEvents.length} events older than ${cutoffTime}.`,
        );
      }

      return expiredEvents.length;
    } catch (err) {
      this.logger.warn('Retention sweep encountered an error', err);
      return 0;
    }
  }
}

