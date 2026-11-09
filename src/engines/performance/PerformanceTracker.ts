import type { EventBus } from '../../core/EventBus.js';
import type { Logger } from '../../core/Logger.js';
import type { CorrelationManager } from '../../core/CorrelationManager.js';
import type { TrackerConfig, TrackerEvent, PerformanceEventData } from '../../types/index.js';
import { generateId } from '../../utils/generateId.js';
import { isoTimestamp, hrtime, elapsed } from '../../utils/time.js';
import { MetricsCollector, type OperationSummary } from './MetricsCollector.js';
import { ThresholdManager } from './ThresholdManager.js';

export interface PerformanceTrackerOptions {
  readonly defaultThresholdMs?: number;
  readonly maxSamplesPerOperation?: number;
  readonly thresholds?: Record<string, number>;
}

export class PerformanceTracker {
  private readonly collector: MetricsCollector;
  private readonly thresholdManager: ThresholdManager;
  private readonly eventBus?: EventBus;
  private readonly logger?: Logger;
  private readonly correlationManager?: CorrelationManager;
  private readonly config?: TrackerConfig;

  constructor(
    options?: PerformanceTrackerOptions,
    dependencies?: {
      eventBus?: EventBus;
      logger?: Logger;
      correlationManager?: CorrelationManager;
      config?: TrackerConfig;
    },
  ) {
    this.collector = new MetricsCollector(options?.maxSamplesPerOperation);
    this.thresholdManager = new ThresholdManager(options?.defaultThresholdMs);

    if (options?.thresholds) {
      for (const [op, limit] of Object.entries(options.thresholds)) {
        this.thresholdManager.setThreshold(op, limit);
      }
    }

    this.eventBus = dependencies?.eventBus;
    this.logger = dependencies?.logger;
    this.correlationManager = dependencies?.correlationManager;
    this.config = dependencies?.config;
  }

  /**
   * Set threshold limit for an operation in milliseconds.
   */
  setThreshold(operation: string, thresholdMs: number): void {
    this.thresholdManager.setThreshold(operation, thresholdMs);
  }

  /**
   * Measure the execution time of a synchronous or asynchronous function.
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T> | T,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const start = hrtime();
    try {
      const result = await fn();
      const duration = elapsed(start);
      this.record(operation, duration, undefined, metadata);
      return result;
    } catch (error) {
      const duration = elapsed(start);
      this.record(operation, duration, undefined, {
        ...(metadata ?? {}),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start a manual timer for an operation. Returns an object with an `end()` method.
   */
  startTimer(
    operation: string,
    metadata?: Record<string, unknown>,
  ): { end: (customMetrics?: Record<string, number>) => number } {
    const start = hrtime();
    return {
      end: (customMetrics?: Record<string, number>): number => {
        const duration = elapsed(start);
        this.record(operation, duration, customMetrics, metadata);
        return duration;
      },
    };
  }

  /**
   * Directly record a performance measurement.
   */
  record(
    operation: string,
    duration: number,
    metrics?: Record<string, number>,
    metadata?: Record<string, unknown>,
  ): TrackerEvent {
    this.collector.record(operation, duration);

    const { exceeded, threshold } = this.thresholdManager.isExceeded(operation, duration);

    const perfData: PerformanceEventData = {
      operation,
      duration: Math.round(duration * 100) / 100,
      threshold,
      exceeded,
      metrics,
    };

    const event: TrackerEvent = {
      id: generateId(),
      type: 'performance',
      timestamp: isoTimestamp(),
      appName: this.config?.appName ?? 'app',
      environment: this.config?.environment ?? 'development',
      userId: this.correlationManager?.getUserId(),
      sessionId: this.correlationManager?.getSessionId(),
      correlationId: this.correlationManager?.getCorrelationId(),
      source: 'PerformanceTracker',
      data: {
        ...perfData,
        ...(metadata ? { metadata } : {}),
      },
    };

    this.eventBus?.emit('event:created', event);

    if (exceeded) {
      this.logger?.warn(
        `[PerformanceTracker] Operation "${operation}" took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`,
      );
    } else {
      this.logger?.debug(
        `[PerformanceTracker] Operation "${operation}" completed in ${duration.toFixed(2)}ms`,
      );
    }

    return event;
  }

  /**
   * Get metrics summary for a specific operation or all operations.
   */
  getSummary(operation?: string): OperationSummary | Record<string, OperationSummary> | undefined {
    if (operation) {
      return this.collector.getSummary(operation);
    }
    return this.collector.getAllSummaries();
  }

  /**
   * Reset all collected metrics.
   */
  reset(): void {
    this.collector.clear();
  }
}
