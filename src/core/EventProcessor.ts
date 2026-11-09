import type {
  TrackerEvent,
  TrackerConfig,
  StorageAdapter,
} from '../types/index.js';
import { Logger } from './Logger.js';
import { EventBus, BUILT_IN_EVENTS } from './EventBus.js';
import { redactSensitiveData } from '../utils/redact.js';
import { safeSerialize } from '../utils/safeSerialize.js';

export interface ProcessorMetrics {
  readonly processed: number;
  readonly filtered: number;
  readonly redacted: number;
  readonly sampledOut: number;
  readonly deduplicated: number;
  readonly errors: number;
}

/**
 * Processes events through the TrackFlow pipeline:
 *
 *   validate → filter → deduplicate → redact → payload-limit → sample → custom-processors → store
 *
 * Emits `event:processed` on success and `event:error` on failure.
 */
export class EventProcessor {
  private readonly config: TrackerConfig;
  private readonly storage: StorageAdapter | null;
  private readonly logger: Logger;
  private readonly eventBus: EventBus;
  private readonly customProcessors: Array<(event: TrackerEvent) => TrackerEvent | null> = [];

  // Deduplication sliding cache
  private readonly dedupCache = new Map<string, number>();

  // Internal metrics
  private processedCount = 0;
  private filteredCount = 0;
  private redactedCount = 0;
  private sampledOutCount = 0;
  private deduplicatedCount = 0;
  private errorCount = 0;

  constructor(
    config: TrackerConfig,
    storage: StorageAdapter | null,
    logger: Logger,
    eventBus: EventBus,
  ) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;
    this.eventBus = eventBus;
  }

  /** Add a custom pipeline processor. Return null to drop event. */
  addProcessor(processor: (event: TrackerEvent) => TrackerEvent | null): void {
    this.customProcessors.push(processor);
  }

  /** Run a single event through the full processing pipeline. */
  async process(event: TrackerEvent): Promise<void> {
    try {
      // 1. Validation
      const validationErrors = this.validateEvent(event);
      if (validationErrors.length > 0) {
        this.errorCount++;
        this.logger.warn(
          `Event validation failed for '${event.id ?? 'unknown'}': ${validationErrors.join(', ')}`,
        );
        this.eventBus.emit(BUILT_IN_EVENTS.EVENT_ERROR, {
          event,
          errors: validationErrors,
          stage: 'validation',
        });
        return;
      }

      // 2. Subsystem filtering
      if (this.shouldFilter(event)) {
        this.filteredCount++;
        this.logger.debug(`Event '${event.id}' filtered out by tracking config`);
        return;
      }

      // 3. Deduplication
      if (this.isDuplicate(event)) {
        this.deduplicatedCount++;
        this.logger.debug(`Event '${event.id}' dropped as duplicate`);
        this.eventBus.emit('event:deduplicated', event);
        return;
      }

      // 4. Redaction
      let currentEvent = this.redactEvent(event);

      // 5. Maximum payload size enforcement
      currentEvent = this.enforcePayloadLimit(currentEvent);

      // 6. Sampling (critical & error events bypass sampling by default)
      if (!this.shouldSample(currentEvent)) {
        this.sampledOutCount++;
        this.logger.debug(`Event '${currentEvent.id}' dropped by sampling`);
        return;
      }

      // 7. Custom plugin processors
      for (const customProcessor of this.customProcessors) {
        try {
          const transformed = customProcessor(currentEvent);
          if (transformed === null) {
            this.filteredCount++;
            this.logger.debug(`Event '${currentEvent.id}' dropped by custom plugin processor`);
            return;
          }
          currentEvent = transformed;
        } catch (procErr) {
          this.logger.warn(`Custom processor threw for event '${currentEvent.id}'`, procErr);
        }
      }

      // 8. Storage persistence
      if (this.storage) {
        await this.storage.save(currentEvent);
        this.logger.debug(`Event '${currentEvent.id}' stored successfully`);
      }

      this.processedCount++;
      this.eventBus.emit(BUILT_IN_EVENTS.EVENT_PROCESSED, currentEvent);
    } catch (err) {
      this.errorCount++;
      this.logger.error(`Failed to process event '${event.id ?? 'unknown'}'`, err);
      this.eventBus.emit(BUILT_IN_EVENTS.EVENT_ERROR, {
        event,
        error: err,
        stage: 'processing',
      });
      // Re-throw so caller (EventQueue) can retry or route to OfflineBuffer
      throw err;
    }
  }

  /** Process an array of events sequentially through the pipeline. */
  async processBatch(events: TrackerEvent[]): Promise<void> {
    for (const event of events) {
      await this.process(event);
    }
  }

  /** Return operational metrics for the processor. */
  getMetrics(): ProcessorMetrics {
    return {
      processed: this.processedCount,
      filtered: this.filteredCount,
      redacted: this.redactedCount,
      sampledOut: this.sampledOutCount,
      deduplicated: this.deduplicatedCount,
      errors: this.errorCount,
    };
  }

  // ── Private pipeline stages ─────────────────────────────────────

  private validateEvent(event: TrackerEvent): string[] {
    const errors: string[] = [];

    if (!event.id || typeof event.id !== 'string') {
      errors.push('Missing or invalid "id"');
    }
    if (!event.type || typeof event.type !== 'string') {
      errors.push('Missing or invalid "type"');
    }
    if (!event.timestamp || typeof event.timestamp !== 'string') {
      errors.push('Missing or invalid "timestamp"');
    }
    if (!event.appName || typeof event.appName !== 'string') {
      errors.push('Missing or invalid "appName"');
    }

    return errors;
  }

  private shouldFilter(event: TrackerEvent): boolean {
    const tracking = this.config.tracking;
    if (!tracking) return false;

    const typeFilterMap: Record<string, boolean | undefined> = {
      change: tracking.changes,
      activity: tracking.activities,
      performance: tracking.performance,
      error: tracking.errors,
    };

    const enabledFlag = typeFilterMap[event.type];
    return enabledFlag === false;
  }

  private isDuplicate(event: TrackerEvent): boolean {
    const dedup = this.config.deduplication;
    if (!dedup || !dedup.enabled) return false;

    const ttlMs = dedup.ttlMs ?? 5_000;
    const maxSize = dedup.maxSize ?? 1_000;
    const now = Date.now();

    const signature = `${event.type}:${event.source ?? ''}:${safeSerialize(event.data)}`;
    const lastSeen = this.dedupCache.get(signature);

    if (lastSeen !== undefined && now - lastSeen < ttlMs) {
      return true;
    }

    // Evict oldest entries if map exceeds bounded maxSize
    if (this.dedupCache.size >= maxSize) {
      const firstKey = this.dedupCache.keys().next().value;
      if (firstKey !== undefined) {
        this.dedupCache.delete(firstKey);
      }
    }

    this.dedupCache.set(signature, now);
    return false;
  }

  private redactEvent(event: TrackerEvent): TrackerEvent {
    const redaction = this.config.redaction;
    if (!redaction || !redaction.enabled) {
      return event;
    }

    let redactedData = event.data;
    if (redactedData !== null && typeof redactedData === 'object') {
      redactedData = redactSensitiveData(
        redactedData as Record<string, unknown>,
        redaction,
      );
      this.redactedCount++;
    }

    return { ...event, data: redactedData };
  }

  private enforcePayloadLimit(event: TrackerEvent): TrackerEvent {
    const limit = this.config.redaction?.maxPayloadSize;
    if (!limit || limit <= 0 || event.data === null || event.data === undefined) {
      return event;
    }

    const serialized = safeSerialize(event.data);
    if (serialized.length > limit) {
      this.logger.warn(
        `Event '${event.id}' payload (${serialized.length} bytes) exceeded limit of ${limit} bytes. Truncating.`,
      );
      return {
        ...event,
        data: {
          _truncated: true,
          originalSize: serialized.length,
          maxAllowed: limit,
          preview: serialized.slice(0, Math.min(limit, 200)) + '...',
          message: `Payload exceeded max size limit of ${limit} bytes.`,
        },
      };
    }

    return event;
  }

  private shouldSample(event: TrackerEvent): boolean {
    // Preserve errors and critical events from being sampled out unless explicitly configured
    if (event.priority === 'critical' || (event.type === 'error' && !this.config.sampling?.rules?.error)) {
      return true;
    }

    const sampling = this.config.sampling;
    if (!sampling) return true;

    const typeRate = sampling.rules?.[event.type];
    const rate = typeRate ?? sampling.rate ?? 1.0;

    if (rate >= 1.0) return true;
    if (rate <= 0.0) return false;

    return Math.random() < rate;
  }
}
