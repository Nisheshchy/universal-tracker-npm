import { createNodeTracker } from 'trackflow/node';

async function main() {
  // Creates tracker and automatically registers:
  // - uncaughtException capture
  // - unhandledRejection capture
  // - periodic System metrics (CPU, Memory RSS/Heap, Event Loop delay)
  // - graceful shutdown on SIGINT/SIGTERM
  const { tracker, nodeCollector } = createNodeTracker({
    config: {
      appName: 'node-backend-worker',
      environment: 'staging',
      storage: {
        type: 'file',
        options: {
          filePath: './worker-events.ndjson',
        },
      },
    },
    collectorOptions: {
      collectSystemMetrics: true,
      systemMetricsIntervalMs: 5000,
    },
  });

  await tracker.start();
  console.log('Node tracker started with automatic system and error monitoring.');

  // Manual timer
  const timer = tracker.performance.startTimer('heavy-computation');
  for (let i = 0; i < 1_000_000; i++) {
    Math.sqrt(i);
  }
  const duration = timer.end({ loopCount: 1_000_000 });
  console.log(`Computation completed in ${duration.toFixed(2)} ms`);

  // Print system summary
  console.log('Tracker status:', tracker.getStatus());

  await tracker.flush();
  nodeCollector.uninstall();
  await tracker.stop();
}

main().catch(console.error);
