import type {
  TrackerEvent,
  TrackerConfig,
  StorageAdapter,
} from '../types/index.js';
import { Logger } from './Logger.js';
import { EventBus, BUILT_IN_EVENTS } from './EventBus.js';

/**
 * Processes events through the TrackFlow pipeline:
 *
 *   validate → filter → redact → sample → store
 *
 * Each stage can short-circuit the pipeline. Successfully processed
 * events are emitted on the EventBus as `event:processed`.
 */
export class EventProcessor {
  private readonly config: TrackerConfig;
  private readonly storage: StorageAdapter | null;
  private readonly logger: Logger;
  private readonly eventBus: EventBus;
  private readonly customProcessors: Array<(event: TrackerEvent) => TrackerEvent | null> = [];

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
      const validationErrors = this.validateEvent(event);
      if (validationErrors.length > 0) {
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

      if (this.shouldFilter(event)) {
        this.logger.debug(`Event '${event.id}' filtered out by tracking config`);
        return;
      }

      const redactedEvent = this.redactEvent(event);

      if (!this.shouldSample(event)) {
        this.logger.debug(`Event '${redactedEvent.id}' dropped by sampling`);
        return;
      }

      let currentEvent: TrackerEvent = redactedEvent;
      for (const customProcessor of this.customProcessors) {
        try {
          const transformed = customProcessor(currentEvent);
          if (transformed === null) {
            this.logger.debug(`Event '${currentEvent.id}' dropped by custom plugin processor`);
            return;
          }
          currentEvent = transformed;
        } catch (procErr) {
          this.logger.warn(`Custom processor threw for event '${currentEvent.id}'`, procErr);
        }
      }

      if (this.storage) {
        await this.storage.save(currentEvent);
        this.logger.debug(`Event '${currentEvent.id}' stored successfully`);
      }

      this.eventBus.emit(BUILT_IN_EVENTS.EVENT_PROCESSED, currentEvent);
    } catch (err) {
      this.logger.error(`Failed to process event '${event.id ?? 'unknown'}'`, err);
      this.eventBus.emit(BUILT_IN_EVENTS.EVENT_ERROR, {
        event,
        error: err,
        stage: 'processing',
      });
    }
  }

  /** Process an array of events sequentially through the pipeline. */
  async processBatch(events: TrackerEvent[]): Promise<void> {
    for (const event of events) {
      await this.process(event);
    }
  }

  // ── Private pipeline stages ─────────────────────────────────────

  /**
   * Validate that the event has all required fields.
   * Returns an array of human-readable error strings (empty = valid).
   */
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

  /**
   * Determine whether the event should be filtered out based on
   * the tracking configuration's enabled event types.
   *
   * Returns `true` if the event should be **dropped**.
   */
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

    // If we have an explicit flag for this type and it's disabled, filter it out
    if (enabledFlag === false) {
      return true;
    }

    return false;
  }

  /**
   * Redact sensitive data from the event based on the redaction config.
   * Returns a new event object with redacted fields (never mutates the original).
   */
  private redactEvent(event: TrackerEvent): TrackerEvent {
    const redaction = this.config.redaction;
    if (!redaction || !redaction.enabled) {
      return event;
    }

    const replacement = redaction.replacement ?? '[REDACTED]';
    const fields = redaction.fields ?? [];
    const patterns = redaction.patterns ?? [];

    // Nothing to redact if no fields or patterns are configured
    if (fields.length === 0 && patterns.length === 0) {
      return event;
    }

    let redactedData = event.data;
    if (redactedData !== null && typeof redactedData === 'object') {
      redactedData = this.redactFields(
        redactedData as Record<string, unknown>,
        fields,
        patterns,
        replacement,
      );
    }

    return { ...event, data: redactedData };
  }

  /**
   * Recursively redact matching field names from an object.
   * Matches against both exact field names (case-insensitive) and regex patterns.
   * Returns a new shallow copy at each level that contains a match.
   */
  private redactFields(
    obj: Record<string, unknown>,
    fields: readonly string[],
    patterns: readonly RegExp[],
    replacement: string,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...obj };
    const lowerFields = fields.map((f) => f.toLowerCase());

    for (const key of Object.keys(result)) {
      const lowerKey = key.toLowerCase();
      const shouldRedact =
        lowerFields.includes(lowerKey) ||
        patterns.some((p) => p.test(key));

      if (shouldRedact) {
        result[key] = replacement;
      } else if (
        result[key] !== null &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.redactFields(
          result[key] as Record<string, unknown>,
          fields,
          patterns,
          replacement,
        );
      }
    }

    return result;
  }

  /**
   * Apply the configured sampling rate.
   * Checks both the global rate and per-event-type rules.
   * Returns `true` if the event should be **kept**.
   */
  private shouldSample(event: TrackerEvent): boolean {
    const sampling = this.config.sampling;
    if (!sampling) return true;

    // Check per-event-type override first
    const typeRate = sampling.rules?.[event.type];
    const rate = typeRate ?? sampling.rate ?? 1.0;

    if (rate >= 1.0) return true;
    if (rate <= 0.0) return false;

    return Math.random() < rate;
  }
}
