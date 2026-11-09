import type { EventBus } from '../../core/EventBus.js';
import type { Logger } from '../../core/Logger.js';
import type { CorrelationManager } from '../../core/CorrelationManager.js';
import type { TrackerConfig, TrackerEvent, ErrorEventData } from '../../types/index.js';
import { generateId } from '../../utils/generateId.js';
import { isoTimestamp } from '../../utils/time.js';
import { ErrorCollector, type ParsedError, type ErrorGroup, type ErrorHistoryEntry } from './ErrorCollector.js';

export interface ErrorTrackerOptions {
  readonly dedupWindowMs?: number;
  readonly maxHistory?: number;
  readonly filter?: (error: ParsedError) => boolean;
}

export class ErrorTracker {
  private readonly collector: ErrorCollector;
  private readonly filterFn?: (error: ParsedError) => boolean;
  private readonly eventBus?: EventBus;
  private readonly logger?: Logger;
  private readonly correlationManager?: CorrelationManager;
  private readonly config?: TrackerConfig;

  constructor(
    options?: ErrorTrackerOptions,
    dependencies?: {
      eventBus?: EventBus;
      logger?: Logger;
      correlationManager?: CorrelationManager;
      config?: TrackerConfig;
    },
  ) {
    this.collector = new ErrorCollector(
      options?.dedupWindowMs ?? 5000,
      options?.maxHistory ?? 500,
    );
    this.filterFn = options?.filter;
    this.eventBus = dependencies?.eventBus;
    this.logger = dependencies?.logger;
    this.correlationManager = dependencies?.correlationManager;
    this.config = dependencies?.config;
  }

  /**
   * Capture and report an error.
   */
  capture(error: unknown, context?: Record<string, unknown>): TrackerEvent {
    const parsed = this.collector.parseError(error);

    // Apply error filter if configured
    if (this.filterFn && !this.filterFn(parsed)) {
      this.logger?.debug(`[ErrorTracker] Error filtered: ${parsed.message}`);
      return this.createErrorEvent(generateId(), parsed, context, true);
    }

    const eventId = generateId();
    const { group } = this.collector.record(eventId, parsed, context);

    const event = this.createErrorEvent(eventId, parsed, context, false, group.count);

    this.eventBus?.emit('event:created', event);
    this.logger?.error(`[ErrorTracker] Captured error: ${parsed.name} - ${parsed.message}`);

    return event;
  }

  /**
   * Capture a plain error or warning message without an Error instance.
   */
  captureMessage(message: string, context?: Record<string, unknown>): TrackerEvent {
    return this.capture(new Error(message), context);
  }

  private createErrorEvent(
    id: string,
    parsed: ParsedError,
    context?: Record<string, unknown>,
    filtered: boolean = false,
    occurrenceCount: number = 1,
  ): TrackerEvent {
    const errorData: ErrorEventData = {
      name: parsed.name,
      message: parsed.message,
      stack: parsed.stack,
      fingerprint: parsed.fingerprint,
      groupId: parsed.fingerprint,
      context: {
        ...(context ?? {}),
        occurrenceCount,
        ...(filtered ? { filtered: true } : {}),
      },
    };

    return {
      id,
      type: 'error',
      timestamp: isoTimestamp(),
      appName: this.config?.appName ?? 'app',
      environment: this.config?.environment ?? 'development',
      userId: this.correlationManager?.getUserId(),
      sessionId: this.correlationManager?.getSessionId(),
      correlationId: this.correlationManager?.getCorrelationId(),
      source: 'ErrorTracker',
      data: errorData,
    };
  }

  /**
   * Get all aggregated error groups.
   */
  getGroups(): ErrorGroup[] {
    return this.collector.getGroups();
  }

  /**
   * Get specific error group by fingerprint.
   */
  getGroup(fingerprint: string): ErrorGroup | undefined {
    return this.collector.getGroup(fingerprint);
  }

  /**
   * Get error history.
   */
  getHistory(limit?: number): ErrorHistoryEntry[] {
    return this.collector.getHistory(limit);
  }

  /**
   * Clear all recorded errors.
   */
  clear(): void {
    this.collector.clear();
  }
}

