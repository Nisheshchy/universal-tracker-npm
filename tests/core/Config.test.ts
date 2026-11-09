import { describe, it, expect } from 'vitest';
import { createConfig, validateConfig } from '../../src/core/Config.js';

describe('Core: Config System', () => {
  it('should create default configuration with sensible fallbacks', () => {
    const config = createConfig({});

    expect(config.appName).toBe('app');
    expect(config.environment).toBe('development');
    expect(config.tracking).toEqual({
      changes: true,
      activities: true,
      performance: true,
      errors: true,
    });
    expect(config.queue?.maxSize).toBe(10_000);
    expect(config.queue?.dropPolicy).toBe('oldest');
    expect(config.sampling?.rate).toBe(1.0);
    expect(config.debug).toBe(false);
  });

  it('should deeply merge partial user overrides without losing nested defaults', () => {
    const config = createConfig({
      appName: 'payment-api',
      environment: 'production',
      tracking: {
        changes: false,
        activities: true,
        performance: true,
        errors: true,
      },
      queue: {
        maxSize: 500,
        dropPolicy: 'newest',
      },
      debug: true,
    });

    expect(config.appName).toBe('payment-api');
    expect(config.environment).toBe('production');
    expect(config.tracking.changes).toBe(false);
    expect(config.tracking.activities).toBe(true);
    expect(config.queue?.maxSize).toBe(500);
    expect(config.queue?.dropPolicy).toBe('newest');
    expect(config.debug).toBe(true);
  });

  it('should validate valid configuration and return empty error list', () => {
    const config = createConfig({ appName: 'valid-app', environment: 'prod' });
    const errors = validateConfig(config);
    expect(errors).toEqual([]);
  });

  it('should reject invalid appName', () => {
    const config = createConfig({ appName: '   ' });
    const errors = validateConfig(config);
    expect(errors).toContain('appName must be a non-empty string');
  });

  it('should reject invalid sampling rate (< 0 or > 1)', () => {
    const config = createConfig({ sampling: { rate: 1.5 } });
    const errors = validateConfig(config);
    expect(errors).toContain('sampling.rate must be a number between 0 and 1');

    const configNeg = createConfig({ sampling: { rate: -0.1 } });
    const errorsNeg = validateConfig(configNeg);
    expect(errorsNeg).toContain('sampling.rate must be a number between 0 and 1');
  });

  it('should reject invalid queue configuration', () => {
    const config = createConfig({
      queue: {
        maxSize: -10,
        dropPolicy: 'invalid-policy' as any,
      },
    });
    const errors = validateConfig(config);
    expect(errors).toContain('queue.maxSize must be a positive integer');
    expect(errors).toContain('queue.dropPolicy must be "oldest" or "newest"');
  });
});
