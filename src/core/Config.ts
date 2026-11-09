import type { TrackerConfig, TrackingConfig, RedactionConfig } from '../types/index.js';

/**
 * Deep-merge defaults into a partial configuration object.
 *
 * Only plain objects are merged recursively; arrays and primitives
 * from `overrides` always take precedence.
 */
function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Record<string, unknown>,
): T {
  const result = { ...defaults } as Record<string, unknown>;

  for (const key of Object.keys(overrides)) {
    const overrideValue = overrides[key];
    const defaultValue = (defaults as Record<string, unknown>)[key];

    if (
      overrideValue !== undefined &&
      overrideValue !== null &&
      typeof overrideValue === 'object' &&
      !Array.isArray(overrideValue) &&
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      !Array.isArray(defaultValue)
    ) {
      result[key] = deepMerge(
        defaultValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>,
      );
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue;
    }
  }

  return result as T;
}

/** Default tracking flags — all subsystems enabled. */
const DEFAULT_TRACKING: TrackingConfig = {
  changes: true,
  activities: true,
  performance: true,
  errors: true,
};

/** Default redaction settings — disabled. */
const DEFAULT_REDACTION: RedactionConfig = {
  enabled: false,
  fields: [],
  patterns: [],
  replacement: '[REDACTED]',
};

/** Default configuration values. */
const DEFAULT_CONFIG: TrackerConfig = {
  appName: 'app',
  environment: 'development',
  tracking: DEFAULT_TRACKING,
  queue: {
    maxSize: 10_000,
    dropPolicy: 'oldest',
  },
  sampling: {
    rate: 1.0,
  },
  redaction: DEFAULT_REDACTION,
  debug: false,
};

/**
 * Create a fully resolved `TrackerConfig` by merging user-supplied
 * partial input over sensible defaults.
 *
 * @param input  Partial config supplied by the consumer.
 * @returns      Complete, validated configuration object.
 */
export function createConfig(input: Partial<TrackerConfig>): TrackerConfig {
  return deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    input as unknown as Record<string, unknown>,
  ) as unknown as TrackerConfig;
}

/**
 * Validate a `TrackerConfig` and return an array of human-readable
 * error messages. An empty array indicates the config is valid.
 */
export function validateConfig(config: TrackerConfig): string[] {
  const errors: string[] = [];

  // appName
  if (!config.appName || typeof config.appName !== 'string' || config.appName.trim().length === 0) {
    errors.push('appName must be a non-empty string');
  }

  // sampling.rate
  if (config.sampling) {
    const rate = config.sampling.rate;
    if (rate !== undefined && rate !== null) {
      if (typeof rate !== 'number' || rate < 0 || rate > 1) {
        errors.push('sampling.rate must be a number between 0 and 1');
      }
    }
  }

  // queue.maxSize
  if (config.queue) {
    const maxSize = config.queue.maxSize;
    if (maxSize !== undefined && maxSize !== null) {
      if (typeof maxSize !== 'number' || maxSize <= 0 || !Number.isInteger(maxSize)) {
        errors.push('queue.maxSize must be a positive integer');
      }
    }
  }

  // queue.dropPolicy
  if (config.queue) {
    const dropPolicy = config.queue.dropPolicy;
    if (
      dropPolicy !== undefined &&
      dropPolicy !== 'oldest' &&
      dropPolicy !== 'newest' &&
      dropPolicy !== 'reject'
    ) {
      errors.push('queue.dropPolicy must be "oldest" or "newest"');
    }
  }

  // stopTimeoutMs
  if (config.stopTimeoutMs !== undefined && config.stopTimeoutMs !== null) {
    if (typeof config.stopTimeoutMs !== 'number' || config.stopTimeoutMs <= 0) {
      errors.push('stopTimeoutMs must be a positive number');
    }
  }

  // deduplication
  if (config.deduplication?.enabled) {
    if (config.deduplication.ttlMs !== undefined && (typeof config.deduplication.ttlMs !== 'number' || config.deduplication.ttlMs <= 0)) {
      errors.push('deduplication.ttlMs must be a positive number');
    }
    if (config.deduplication.maxSize !== undefined && (typeof config.deduplication.maxSize !== 'number' || config.deduplication.maxSize <= 0)) {
      errors.push('deduplication.maxSize must be a positive number');
    }
  }

  // retention
  if (config.retention?.enabled) {
    if (config.retention.maxAgeMs !== undefined && (typeof config.retention.maxAgeMs !== 'number' || config.retention.maxAgeMs <= 0)) {
      errors.push('retention.maxAgeMs must be a positive number');
    }
  }

  // redaction.fields should be an array if provided
  if (config.redaction?.enabled && config.redaction.fields) {
    if (!Array.isArray(config.redaction.fields)) {
      errors.push('redaction.fields must be an array of strings');
    }
  }

  // redaction.patterns should be an array if provided
  if (config.redaction?.enabled && config.redaction.patterns) {
    if (!Array.isArray(config.redaction.patterns)) {
      errors.push('redaction.patterns must be an array of RegExp');
    }
  }

  return errors;
}
