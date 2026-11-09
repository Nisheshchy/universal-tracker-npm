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
}

/** Bounds and eviction policy for the in-memory event queue. */
export interface QueueConfig {
  /** Maximum number of events the queue may hold. */
  readonly maxSize: number;

  /**
   * Which end of the queue is dropped when {@link maxSize} is reached.
   *
   * - `'oldest'` – discard the head (FIFO eviction).
   * - `'newest'` – reject incoming events.
   */
  readonly dropPolicy: 'oldest' | 'newest';
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

  /** In-memory queue bounds. */
  readonly queue?: QueueConfig;

  /** Probabilistic sampling settings. */
  readonly sampling?: SamplingConfig;

  /** Arbitrary metadata attached to every outgoing event. */
  readonly metadata?: Record<string, unknown>;

  /** Enable verbose debug logging. */
  readonly debug?: boolean;
}
