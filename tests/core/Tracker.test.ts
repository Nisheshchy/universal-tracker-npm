import { describe, it, expect } from 'vitest';
import { createTracker, Tracker } from '../../src/core/Tracker.js';

describe('Core: Public createTracker() API', () => {
  it('should instantiate UniversalTracker with defaults', () => {
    const tracker = createTracker();
    expect(tracker).toBeInstanceOf(Tracker);
    expect(tracker.getStatus().appName).toBe('app');
    expect(tracker.getStatus().environment).toBe('development');
    expect(tracker.getStatus().state).toBe('idle');
  });

  it('should accept custom config and initialize engines', () => {
    const tracker = createTracker({
      appName: 'payment-service',
      environment: 'staging',
      debug: false,
    });

    expect(tracker.changes).toBeDefined();
    expect(tracker.activities).toBeDefined();
    expect(tracker.performance).toBeDefined();
    expect(tracker.errors).toBeDefined();
    expect(tracker.getStatus().appName).toBe('payment-service');
  });

  it('should throw Error if configuration is invalid', () => {
    expect(() => {
      createTracker({ appName: '' });
    }).toThrow('Invalid TrackFlow configuration: appName must be a non-empty string');
  });
});

