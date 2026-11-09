# Getting Started with TrackFlow

TrackFlow is an all-in-one universal tracking SDK for Node.js and browser applications. It unifies five tracking capabilities into a single modular architecture:

1. **Change Tracker** — Object mutation, diffs, snapshots, and file tracking.
2. **Activity Tracker** — User actions, sessions, logins, clicks, and timelines.
3. **Performance Tracker** — Execution times, API durations, thresholds, and Node.js CPU/memory metrics.
4. **Error Tracker** — Runtime error capture, stack traces, fingerprinting, and deduplication.
5. **Universal Tracker** — Central pipeline with correlation IDs, buffering, batching, redaction, and storage.

---

## Installation

```bash
npm install trackflow
```

If you plan to use file watching in Node.js, install `chokidar` (optional):

```bash
npm install chokidar
```

---

## Quick Start

```typescript
import { createTracker } from 'trackflow';

// 1. Initialize tracker
const tracker = createTracker({
  appName: 'my-service',
  environment: 'production',
  tracking: {
    changes: true,
    activities: true,
    performance: true,
    errors: true,
  },
});

// 2. Start tracker lifecycle
await tracker.start();

// 3. Track changes
tracker.changes.track('user_profile', { name: 'Alice', role: 'admin' });
tracker.changes.track('user_profile', { name: 'Alice', role: 'superadmin' });

// 4. Track activities
tracker.activities.login('user_123', { method: 'google' });
tracker.activities.track('project.created', { projectId: 'p_456' });

// 5. Measure performance
const data = await tracker.performance.measure('fetch-users', async () => {
  return await db.query('SELECT * FROM users');
});

// 6. Capture errors
try {
  riskyOperation();
} catch (err) {
  tracker.errors.capture(err, { component: 'billing' });
}

// 7. Flush and stop
await tracker.flush();
await tracker.stop();
```

