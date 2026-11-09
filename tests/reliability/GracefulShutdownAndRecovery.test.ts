import { describe, it, expect } from 'vitest';
import { createTracker } from '../../src/engines/universal/UniversalTracker.js';

describe('Reliability, Metrics, Deduplication & Graceful Shutdown', () => {
  it('should deduplicate repeated events within sliding TTL window', async () => {
    const tracker = createTracker({
      appName: 'dedup-test',
      deduplication: {
        enabled: true,
        ttlMs: 2_000,
        maxSize: 50,
      },
    });

    await tracker.start();

    // Fire duplicate events
    tracker.activities.track('user.heartbeat', { ping: 1 });
    tracker.activities.track('user.heartbeat', { ping: 1 });
    tracker.activities.track('user.heartbeat', { ping: 1 });

    // Different event
    tracker.activities.track('user.click', { target: 'login-btn' });

    await tracker.flush();

    const events = await tracker.query();
    // Only 1 heartbeat and 1 click should exist
    expect(events.length).toBe(2);

    const metrics = tracker.getMetrics();
    expect(metrics.processor.deduplicated).toBe(2);
    expect(metrics.processor.processed).toBe(2);

    await tracker.stop();
  });

  it('should provide complete operational metrics and resource reporting', async () => {
    const tracker = createTracker({
      appName: 'metrics-test',
      queue: { maxSize: 100, dropPolicy: 'oldest' },
    });

    await tracker.start();

    tracker.changes.track('user', { id: 1, name: 'Alice' });
    tracker.changes.track('user', { id: 1, name: 'Alice Updated' });
    tracker.activities.track('order.created', { amount: 99 });
    tracker.performance.record('cache.fetch', 12);
    tracker.errors.captureMessage('Handled minor notice');

    await tracker.flush();

    const metrics = tracker.getMetrics();
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(metrics.queue.enqueued).toBe(4);
    expect(metrics.queue.flushCount).toBeGreaterThanOrEqual(1);
    expect(metrics.processor.processed).toBe(4);
    expect(metrics.offlineBuffer.size).toBe(0);

    await tracker.stop();
  });

  it('should cleanly handle shutdown timeout when storage close hangs', async () => {
    const slowStorage = {
      initialize: async () => {},
      save: async () => {},
      saveMany: async () => {},
      query: async () => [],
      flush: async () => {},
      close: async () => {
        // Hang indefinitely
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      },
    };

    const tracker = createTracker({ appName: 'timeout-test' }, slowStorage);
    await tracker.start();

    // Stop with a short 50ms timeout
    await expect(tracker.stop({ timeoutMs: 50 })).rejects.toThrow(
      'TrackFlow shutdown timed out after 50ms',
    );
  });
});
