import { createTracker } from '../src/index.js';
import { hrtime, elapsed } from '../src/utils/time.js';

async function runBenchmark() {
  /* eslint-disable no-console */
  console.log('='.repeat(70));
  console.log(' TrackFlow Phase 4 Comprehensive Performance & Overhead Benchmarks');
  console.log('='.repeat(70));

  const ITERATIONS = 10_000;

  // 1. Baseline: Tracking Disabled vs Enabled
  {
    console.log('\n--- 1. Baseline: Tracking Disabled vs Enabled ---');

    // Disabled
    const trackerDisabled = createTracker({
      appName: 'bench-disabled',
      tracking: { changes: false, activities: false, performance: false, errors: false },
    });
    trackerDisabled.logger.setLevel('silent');
    await trackerDisabled.start();

    const startDisabled = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      trackerDisabled.activities.track('test.action', { count: i });
    }
    await trackerDisabled.flush();
    const msDisabled = elapsed(startDisabled);
    console.log(`[Tracking Disabled] ${ITERATIONS} events: ${msDisabled.toFixed(2)} ms (${(ITERATIONS / (msDisabled / 1000)).toFixed(0)} ops/sec)`);
    await trackerDisabled.stop();

    // Enabled
    const trackerEnabled = createTracker({
      appName: 'bench-enabled',
      tracking: { changes: true, activities: true, performance: true, errors: true },
    });
    trackerEnabled.logger.setLevel('silent');
    await trackerEnabled.start();

    const startEnabled = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      trackerEnabled.activities.track('test.action', { count: i });
    }
    await trackerEnabled.flush();
    const msEnabled = elapsed(startEnabled);
    console.log(`[Tracking Enabled]  ${ITERATIONS} events: ${msEnabled.toFixed(2)} ms (${(ITERATIONS / (msEnabled / 1000)).toFixed(0)} ops/sec)`);
    await trackerEnabled.stop();
  }

  // 2. Single Tracking Engine vs All 4 Engines
  {
    console.log('\n--- 2. Single Engine vs All 4 Engines Concurrently ---');

    // Single Engine (Activity)
    const singleTracker = createTracker({
      appName: 'bench-single',
      tracking: { changes: false, activities: true, performance: false, errors: false },
    });
    singleTracker.logger.setLevel('silent');
    await singleTracker.start();

    const startSingle = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      singleTracker.activities.track('user.action', { index: i });
    }
    await singleTracker.flush();
    const msSingle = elapsed(startSingle);
    console.log(`[Single Engine: Activity] ${ITERATIONS} events: ${msSingle.toFixed(2)} ms (${(ITERATIONS / (msSingle / 1000)).toFixed(0)} ops/sec)`);
    await singleTracker.stop();

    // All 4 Engines
    const multiTracker = createTracker({
      appName: 'bench-all',
      tracking: { changes: true, activities: true, performance: true, errors: true },
      queue: { maxSize: 50_000, dropPolicy: 'oldest' },
    });
    multiTracker.logger.setLevel('silent');
    await multiTracker.start();

    const MULTI_ITER = 2_500;
    const startMulti = hrtime();
    for (let i = 0; i < MULTI_ITER; i++) {
      multiTracker.changes.track(`entity_${i % 10}`, { val: i });
      multiTracker.activities.track('action.multi', { i });
      multiTracker.performance.record('op.multi', 1.5);
      multiTracker.errors.captureMessage(`notice ${i % 5}`);
    }
    await multiTracker.flush();
    const msMulti = elapsed(startMulti);
    const totalEvents = MULTI_ITER * 4;
    console.log(`[All 4 Engines Mixed]     ${totalEvents} events: ${msMulti.toFixed(2)} ms (${(totalEvents / (msMulti / 1000)).toFixed(0)} ops/sec)`);
    await multiTracker.stop();
  }

  // 3. Different Event Batch Sizes (10 vs 50 vs 200)
  {
    console.log('\n--- 3. Batch Size Comparison (10 vs 50 vs 200) ---');
    const batchSizes = [10, 50, 200];

    for (const batchSize of batchSizes) {
      const tracker = createTracker({
        appName: `bench-batch-${batchSize}`,
        queue: { maxSize: 20_000, dropPolicy: 'oldest' },
      });
      tracker.logger.setLevel('silent');
      await tracker.start();

      const start = hrtime();
      for (let i = 0; i < 5_000; i++) {
        tracker.activities.track('batch.event', { i });
      }
      await tracker.flush();
      const ms = elapsed(start);
      console.log(`[Batch Size: ${batchSize.toString().padEnd(3)}] 5000 events: ${ms.toFixed(2)} ms (${(5_000 / (ms / 1000)).toFixed(0)} events/sec)`);
      await tracker.stop();
    }
  }

  // 4. Large Object Deep Comparison (1,000 properties)
  {
    console.log('\n--- 4. Large Object Comparison (1,000 properties) ---');
    const tracker = createTracker({
      appName: 'bench-large-obj',
      tracking: { changes: true, activities: false, performance: false, errors: false },
    });
    tracker.logger.setLevel('silent');
    await tracker.start();

    const objA: Record<string, unknown> = {};
    const objB: Record<string, unknown> = {};

    for (let i = 0; i < 1_000; i++) {
      objA[`prop_${i}`] = { nested: i, label: `label_${i}` };
      objB[`prop_${i}`] = { nested: i === 500 ? 999999 : i, label: `label_${i}` };
    }

    const LARGE_ITER = 500;
    const start = hrtime();
    for (let i = 0; i < LARGE_ITER; i++) {
      tracker.changes.compare(objA, objB);
    }
    const ms = elapsed(start);
    console.log(`[Deep Compare 1k-Prop Object] ${LARGE_ITER} comparisons: ${ms.toFixed(2)} ms (${(LARGE_ITER / (ms / 1000)).toFixed(0)} comparisons/sec)`);
    await tracker.stop();
  }

  // 5. High Event Volume Load (10,000 events through redaction + queue + storage)
  {
    console.log('\n--- 5. High Volume Load (10,000 events through full pipeline) ---');
    const tracker = createTracker({
      appName: 'bench-high-vol',
      redaction: {
        enabled: true,
        fields: ['password', 'apiKey', 'secret'],
        patterns: [],
        replacement: '[REDACTED]',
        maskEmails: true,
      },
      queue: { maxSize: 50_000, dropPolicy: 'oldest' },
    });
    tracker.logger.setLevel('silent');
    await tracker.start();

    const start = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      tracker.activities.track('user.purchase', {
        userId: `user_${i}`,
        password: 'cleartext_password_123',
        email: `buyer_${i}@store.com`,
        amount: (i % 100) + 0.99,
      });
    }
    await tracker.flush();
    const ms = elapsed(start);
    console.log(`[High Volume Pipeline] ${ITERATIONS} redacted events flushed: ${ms.toFixed(2)} ms (${(ITERATIONS / (ms / 1000)).toFixed(0)} events/sec)`);

    const metrics = tracker.getMetrics();
    console.log(`[SDK Metrics] Enqueued: ${metrics.queue.enqueued}, Processed: ${metrics.processor.processed}, Redacted: ${metrics.processor.redacted}`);

    await tracker.stop();
  }

  console.log('\n' + '='.repeat(70));
  console.log(' All Benchmarks Completed Successfully');
  console.log('='.repeat(70));
  /* eslint-enable no-console */
}

runBenchmark().catch(console.error);
