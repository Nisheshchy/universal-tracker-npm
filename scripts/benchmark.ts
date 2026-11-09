import { createTracker } from '../src/index.js';
import { hrtime, elapsed } from '../src/utils/time.js';

async function runBenchmark() {
  /* eslint-disable no-console */
  console.log('='.repeat(60));
  console.log(' TrackFlow Engine Performance & Overhead Benchmarks');
  console.log('='.repeat(60));

  const ITERATIONS = 10_000;

  // 1. Change Tracker Benchmark
  {
    const tracker = createTracker({
      appName: 'bench-change',
      tracking: { changes: true, activities: false, performance: false, errors: false },
    });
    await tracker.start();

    const objA = { name: 'Alice', count: 0, items: [1, 2, 3], nested: { x: 1 } };
    const objB = { name: 'Alice', count: 1, items: [1, 2, 4], nested: { x: 2 } };

    const start = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      tracker.changes.compare(objA, objB);
    }
    const ms = elapsed(start);
    console.log(`[ChangeTracker] compare x ${ITERATIONS}: ${ms.toFixed(2)} ms (${(ITERATIONS / (ms / 1000)).toFixed(0)} ops/sec)`);
    await tracker.stop();
  }

  // 2. Activity Tracker Benchmark
  {
    const tracker = createTracker({
      appName: 'bench-activity',
      tracking: { changes: false, activities: true, performance: false, errors: false },
    });
    await tracker.start();

    const start = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      tracker.activities.track('user.click', { userId: 'u123', btnId: `btn_${i}` });
    }
    const ms = elapsed(start);
    console.log(`[ActivityTracker] track x ${ITERATIONS}: ${ms.toFixed(2)} ms (${(ITERATIONS / (ms / 1000)).toFixed(0)} ops/sec)`);
    await tracker.stop();
  }

  // 3. Performance Tracker Benchmark
  {
    const tracker = createTracker({
      appName: 'bench-perf',
      tracking: { changes: false, activities: false, performance: true, errors: false },
    });
    await tracker.start();

    const start = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      tracker.performance.record('cache.lookup', 0.25, { hit: 1 });
    }
    const ms = elapsed(start);
    console.log(`[PerformanceTracker] record x ${ITERATIONS}: ${ms.toFixed(2)} ms (${(ITERATIONS / (ms / 1000)).toFixed(0)} ops/sec)`);
    await tracker.stop();
  }

  // 4. Error Tracker Benchmark
  {
    const tracker = createTracker({
      appName: 'bench-error',
      debug: false,
      tracking: { changes: false, activities: false, performance: false, errors: true },
    });
    // Suppress console error output for benchmark
    tracker.logger.setLevel('silent');
    await tracker.start();

    const err = new Error('Test benchmark error');
    const start = hrtime();
    for (let i = 0; i < ITERATIONS; i++) {
      tracker.errors.capture(err, { iter: i });
    }
    const ms = elapsed(start);
    console.log(`[ErrorTracker] capture x ${ITERATIONS}: ${ms.toFixed(2)} ms (${(ITERATIONS / (ms / 1000)).toFixed(0)} ops/sec)`);
    await tracker.stop();
  }

  // 5. Universal Pipeline (all 4 engines running together + queue + flush)
  {
    const tracker = createTracker({
      appName: 'bench-all',
      debug: false,
      tracking: { changes: true, activities: true, performance: true, errors: true },
      queue: { maxSize: 50_000, dropPolicy: 'oldest' },
    });
    tracker.logger.setLevel('silent');
    await tracker.start();

    const start = hrtime();
    const MULTI_ITER = 2_500;
    for (let i = 0; i < MULTI_ITER; i++) {
      tracker.changes.track(`entity_${i % 10}`, { val: i });
      tracker.activities.track('action.multi', { i });
      tracker.performance.record('op.multi', 1.5);
      tracker.errors.captureMessage(`error ${i % 5}`);
    }
    await tracker.flush();
    const ms = elapsed(start);
    const totalOps = MULTI_ITER * 4;
    console.log(`[UniversalTracker] All 4 engines x ${MULTI_ITER} (${totalOps} total events processed & flushed): ${ms.toFixed(2)} ms (${(totalOps / (ms / 1000)).toFixed(0)} events/sec)`);
    await tracker.stop();
  }

  console.log('='.repeat(60));
  console.log(' Benchmark Completed Successfully');
  console.log('='.repeat(60));
  /* eslint-enable no-console */
}

runBenchmark().catch(console.error);
