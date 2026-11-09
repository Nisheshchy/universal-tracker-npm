import { describe, it, expect } from 'vitest';
import { createTracker } from '../../src/index.js';

describe('Cross-Engine Integration & Configuration', () => {
  it('should allow selective disabling of tracking engines via config.tracking', async () => {
    // Enable only errors and performance; disable changes and activities
    const tracker = createTracker({
      appName: 'selective-app',
      tracking: {
        changes: false,
        activities: false,
        performance: true,
        errors: true,
      },
    });

    await tracker.start();

    // Trigger all 4 engines
    tracker.changes.track('profile', { name: 'A' });
    tracker.changes.track('profile', { name: 'B' }); // should be filtered out
    tracker.activities.track('user.click'); // should be filtered out
    tracker.performance.record('cache.read', 12); // should be stored
    tracker.errors.capture(new Error('Test failure')); // should be stored

    await tracker.flush();

    const storedEvents = await tracker.query();
    const storedTypes = storedEvents.map((e) => e.type);

    expect(storedTypes).toContain('performance');
    expect(storedTypes).toContain('error');
    expect(storedTypes).not.toContain('change');
    expect(storedTypes).not.toContain('activity');

    await tracker.stop();
  });

  it('should propagate shared correlation IDs across all engines', async () => {
    const tracker = createTracker({ appName: 'correlation-app' });
    await tracker.start();

    const traceId = 'req_distributed_555';
    tracker.setCorrelationId(traceId);
    tracker.identify('user_alice');

    // 1. Change
    tracker.changes.track('account', { balance: 100 });
    tracker.changes.track('account', { balance: 150 });

    // 2. Activity
    tracker.activities.track('transfer.initiated', { amount: 50 });

    // 3. Performance
    await tracker.performance.measure('bank.transfer', async () => {
      return { success: true };
    });

    // 4. Error
    tracker.errors.captureMessage('Minor warning in ledger');

    await tracker.flush();

    const events = await tracker.query();
    expect(events.length).toBeGreaterThanOrEqual(4);

    for (const event of events) {
      if (event.type !== 'change') {
        // Activity, performance, and error receive the active correlation context
        expect(event.correlationId).toBe(traceId);
      }
    }

    await tracker.stop();
  });

  it('ChangeTracker should generate structured JSON diffs and formatted diff strings', () => {
    const tracker = createTracker();

    const before = {
      user: { name: 'Alice', age: 30 },
      tags: ['alpha', 'beta'],
      removedField: 'bye',
    };

    const after = {
      user: { name: 'Alice', age: 31 },
      tags: ['alpha', 'gamma'],
      addedField: 'hello',
    };

    // Test structured jsonDiff
    const jsonDiff = tracker.changes.jsonDiff(before, after);
    expect(jsonDiff.added).toHaveProperty('addedField', 'hello');
    expect(jsonDiff.deleted).toHaveProperty('removedField', 'bye');
    expect(jsonDiff.updated).toHaveProperty('user.age', { before: 30, after: 31 });
    expect(jsonDiff.updated).toHaveProperty('tags[1]', { before: 'beta', after: 'gamma' });

    // Test formatted generateDiff
    const diffString = tracker.changes.generateDiff(before, after);
    expect(typeof diffString).toBe('string');
    const parsed = JSON.parse(diffString);
    expect(parsed.added.addedField).toBe('hello');
  });

  it('PerformanceTracker threshold manager should flag exceeded operations and notify logger', async () => {
    const tracker = createTracker({ appName: 'perf-threshold-app' });
    await tracker.start();

    tracker.performance.setThreshold('db.slowQuery', 50); // 50ms budget

    // Fast call (under threshold)
    const fastEvt = tracker.performance.record('db.slowQuery', 20);
    expect((fastEvt.data as any).exceeded).toBe(false);

    // Slow call (exceeds threshold)
    const slowEvt = tracker.performance.record('db.slowQuery', 95);
    expect((slowEvt.data as any).exceeded).toBe(true);
    expect((slowEvt.data as any).threshold).toBe(50);

    const summary = tracker.performance.getSummary('db.slowQuery');
    expect(summary).toBeDefined();
    expect(summary?.count).toBe(2);
    expect(summary?.max).toBe(95);

    await tracker.stop();
  });

  it('ErrorTracker should aggregate duplicate errors into groups with correct counts', async () => {
    const tracker = createTracker({ appName: 'error-grouping-app' });
    await tracker.start();

    // Throw same error 3 times
    for (let i = 0; i < 3; i++) {
      try {
        throw new ReferenceError('x is not defined');
      } catch (err) {
        tracker.errors.capture(err);
      }
    }

    const groups = tracker.errors.getGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.name).toBe('ReferenceError');
    expect(groups[0]?.message).toBe('x is not defined');

    await tracker.stop();
  });
});
