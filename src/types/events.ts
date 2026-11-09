/**
 * Core event type definitions for the TrackFlow tracking system.
 *
 * All tracker events flow through a unified {@link TrackerEvent} interface,
 * discriminated by {@link TrackerEventType}. Each event type carries a
 * specific data payload (e.g. {@link ChangeEventData}, {@link ErrorEventData}).
 */

/** Union of all supported event types. */
export type TrackerEventType =
  | 'change'
  | 'activity'
  | 'performance'
  | 'error'
  | 'system';

/**
 * The unified event envelope shared by every tracker event.
 *
 * `data` is intentionally typed as `unknown` at this level so that
 * higher-level code can narrow it based on {@link TrackerEventType}.
 */
export interface TrackerEvent {
  /** Globally unique event identifier. */
  readonly id: string;

  /** Discriminator indicating the kind of event. */
  readonly type: TrackerEventType;

  /** ISO 8601 timestamp of when the event was created. */
  readonly timestamp: string;

  /** Application name that produced this event. */
  readonly appName: string;

  /** Deployment environment (e.g. 'production', 'staging'). */
  readonly environment: string;

  /** Optional identifier of the user who triggered the event. */
  readonly userId?: string;

  /** Optional session identifier grouping related events. */
  readonly sessionId?: string;

  /** Optional correlation identifier for distributed tracing. */
  readonly correlationId?: string;

  /** Logical source of the event (e.g. module or service name). */
  readonly source?: string;

  /** Event-type-specific payload. */
  readonly data: unknown;
}

// ---------------------------------------------------------------------------
// Event-specific data payloads
// ---------------------------------------------------------------------------

/** The kind of mutation that a change event represents. */
export type ChangeType = 'added' | 'updated' | 'deleted';

/** Payload attached to `change` events. */
export interface ChangeEventData {
  /** The entity or model that was changed (e.g. 'User', 'Order'). */
  readonly entity: string;

  /** The property / field on the entity that changed. */
  readonly property: string;

  /** Value before the change (absent for 'added'). */
  readonly before: unknown;

  /** Value after the change (absent for 'deleted'). */
  readonly after: unknown;

  /** Kind of mutation. */
  readonly changeType: ChangeType;

  /** Optional dot-separated path for nested property changes. */
  readonly path?: string;
}

/** Payload attached to `activity` events. */
export interface ActivityEventData {
  /** Human-readable action description (e.g. 'clicked_button'). */
  readonly action: string;

  /** Optional user who performed the activity. */
  readonly userId?: string;

  /** Arbitrary metadata associated with the activity. */
  readonly metadata?: Record<string, unknown>;

  /** Categorisation label for the activity. */
  readonly category?: string;

  /** Session identifier for grouping related activities. */
  readonly sessionId?: string;
}

/** Payload attached to `performance` events. */
export interface PerformanceEventData {
  /** Name of the measured operation (e.g. 'db.query', 'api.call'). */
  readonly operation: string;

  /** Duration of the operation in milliseconds. */
  readonly duration: number;

  /** Optional threshold that the duration is compared against. */
  readonly threshold?: number;

  /** Whether the duration exceeded the threshold. */
  readonly exceeded?: boolean;

  /** Additional numeric metrics captured during the operation. */
  readonly metrics?: Record<string, number>;
}

/** Payload attached to `error` events. */
export interface ErrorEventData {
  /** Human-readable error message. */
  readonly message: string;

  /** Stack trace string, if available. */
  readonly stack?: string;

  /** Error class / constructor name (e.g. 'TypeError'). */
  readonly name?: string;

  /** Deterministic fingerprint for deduplication. */
  readonly fingerprint?: string;

  /** Group identifier for error aggregation. */
  readonly groupId?: string;

  /** Arbitrary contextual information captured at the time of the error. */
  readonly context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Query & batching helpers
// ---------------------------------------------------------------------------

/** Filter criteria for querying stored events. */
export interface EventFilter {
  /** Restrict to a specific event type. */
  readonly type?: TrackerEventType;

  /** Restrict to a specific source. */
  readonly source?: string;

  /** Restrict to a specific user. */
  readonly userId?: string;

  /** Inclusive lower bound (ISO 8601). */
  readonly startTime?: string;

  /** Inclusive upper bound (ISO 8601). */
  readonly endTime?: string;

  /** Maximum number of events to return. */
  readonly limit?: number;

  /** Number of events to skip (for pagination). */
  readonly offset?: number;
}

/** Configuration for batching events before flushing to storage. */
export interface EventBatchConfig {
  /** Maximum number of events per batch. */
  readonly maxSize: number;

  /** Interval (in milliseconds) between automatic flushes. */
  readonly flushInterval: number;

  /** Number of retry attempts when a flush fails. */
  readonly maxRetries: number;
}
