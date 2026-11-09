/**
 * Configuration types for the TrackFlow tracker.
 *
 * {@link TrackerConfig} is the top-level configuration object accepted when
 * initialising a tracker instance. It composes several focused sub-configs
 * ({@link TrackingConfig}, {@link RedactionConfig}, etc.) to keep concerns
 * separated while remaining easy to construct.
 */

/** Verbosity levels for the internal logger. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Feature flags controlling which tracker subsystems are active. */
export interface TrackingConfig {
  /** Track entity/property mutations. */
  readonly changes: boolean;

  /** Track user and system activities. */
  readonly activities: boolean;

  /** Track operation durations and metrics. */
  readonly performance: boolean;

  /** Capture and track errors. */
  readonly errors: boolean;
}

/**
 * Privacy / PII redaction settings.
 *
 * When {@link enabled} is `true`, event payloads are scrubbed before
 * persistence according to the supplied field names and regex patterns.
 */
export interface RedactionConfig {
  /** Master toggle for redaction. */
  readonly enabled: boolean;

  /** Exact field names to redact (case-insensitive match). */
  readonly fields: string[];

  /** Regular expression patterns matched against field names. */
  readonly patterns: RegExp[];

  /** Replacement string injected in place of redacted values. */
  readonly replacement: string;

  /** Whether to partially mask email addresses (e.g. j***@example.com). */
  readonly maskEmails?: boolean;

  /** Whether to partially mask phone numbers (e.g. ***-***-1234). */
  readonly maskPhones?: boolean;

  /** Whether to partially mask credit card numbers (e.g. ****-****-****-1234). */
  readonly maskCreditCards?: boolean;

  /** Maximum byte size allowed for an event's data payload (excess is truncated). */
  readonly maxPayloadSize?: number;

  /** List of property names that should be stripped completely from event payloads. */
  readonly ignoredProperties?: string[];
}

/** Bounds and eviction policy for the in-memory event queue. */
export interface QueueConfig {
  /** Maximum number of events the queue may hold. */
  readonly maxSize: number;

  /**
   * Which policy applies when {@link maxSize} is reached.
   *
   * - `'oldest'` – discard the head (FIFO eviction).
   * - `'newest'` – drop incoming events silently or with warning.
   * - `'reject'` – throw an error when attempting to enqueue.
   */
  readonly dropPolicy: 'oldest' | 'newest' | 'reject';

  /** Number of retry attempts when flushing to storage fails. */
  readonly maxRetries?: number;

  /** Base delay in milliseconds for exponential backoff retries. */
  readonly retryBaseDelayMs?: number;

  /** Maximum delay in milliseconds for exponential backoff retries. */
  readonly retryMaxDelayMs?: number;
}

/** Configuration for sliding-window event deduplication. */
export interface DeduplicationConfig {
  /** Master toggle for deduplication. */
  readonly enabled: boolean;

  /** Time window in milliseconds during which duplicate events are dropped. */
  readonly ttlMs?: number;

  /** Maximum number of fingerprints to keep in memory cache. */
  readonly maxSize?: number;
}

/** Configuration for storage data retention and auto-cleanup. */
export interface RetentionConfig {
  /** Master toggle for automatic retention cleanup. */
  readonly enabled: boolean;

  /** Maximum age of events in milliseconds before they are purged. */
  readonly maxAgeMs?: number;

  /** Maximum number of total events to retain in storage. */
  readonly maxEvents?: number;

  /** Interval in milliseconds between background cleanup sweeps. */
  readonly cleanupIntervalMs?: number;
}

/**
 * Probabilistic sampling configuration.
 *
 * {@link rate} is a global sampling probability in the range `[0, 1]`.
 * {@link rules} allows per-event-type overrides keyed by
 * {@link import('./events').TrackerEventType}.
 */
export interface SamplingConfig {
  /** Global sampling rate (0 = drop all, 1 = keep all). */
  readonly rate: number;

  /** Optional per-event-type overrides. */
  readonly rules?: Record<string, number>;
}

/**
 * Top-level configuration for a TrackFlow tracker instance.
 *
 * Only {@link appName} and {@link environment} are required; every other
 * field falls back to sensible defaults inside the tracker.
 */
export interface TrackerConfig {
  /** Unique name identifying the application. */
  readonly appName: string;

  /** Deployment environment label (e.g. `'production'`). */
  readonly environment: string;

  /** Feature flags for individual tracker subsystems. */
  readonly tracking: TrackingConfig;

  /** Storage backend configuration. */
  readonly storage?: import('./storage').StorageConfig;

  /** PII / sensitive-data redaction settings. */
  readonly redaction?: RedactionConfig;

  /** In-memory queue bounds and retry settings. */
  readonly queue?: QueueConfig;

  /** Probabilistic sampling settings. */
  readonly sampling?: SamplingConfig;

  /** Event deduplication settings. */
  readonly deduplication?: DeduplicationConfig;

  /** Storage data retention settings. */
  readonly retention?: RetentionConfig;

  /** Timeout in milliseconds for graceful stop / shutdown. */
  readonly stopTimeoutMs?: number;

  /** Arbitrary metadata attached to every outgoing event. */
  readonly metadata?: Record<string, unknown>;

  /** Enable verbose debug logging. */
  readonly debug?: boolean;
}
