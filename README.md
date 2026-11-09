# TrackFlow

> **Universal Application Tracking npm Package** — Monitor changes, activities, performance, errors, and system events through a unified event-processing architecture.

[![npm version](https://img.shields.io/badge/npm-v1.0.0-blue.svg)](https://www.npmjs.com/package/trackflow)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-yellow.svg)](https://vitest.dev/)
[![ESM + CommonJS](https://img.shields.io/badge/module-ESM%20%2B%20CommonJS-purple.svg)](#)

---

## 📖 Overview

**TrackFlow** is an all-in-one developer-focused tracking SDK designed for production Node.js and browser applications. Instead of installing separate packages for analytics, APM, error monitoring, and state diffing, TrackFlow unifies all four tracking domains under a single coherent pipeline with correlation IDs, backpressure handling, sensitive data redaction, and pluggable storage.

TrackFlow is an actual npm package built with TypeScript, offering dual ESM and CommonJS exports, strict type safety, zero mandatory runtime dependencies for its core engine, and blazing performance (over 170,000 events/second in universal benchmarks).

---

## ⚡ Key Features

- **🔄 Change Tracker** — Deep object comparison, property additions/updates/deletions, array modifications, snapshots, historical change logs, and local file watching.
- **👤 Activity Tracker** — User authentication events (`login`, `logout`, `register`), custom business actions, UI interactions, session tracking with timeouts, user traits, and activity timelines.
- **⏱️ Performance Tracker** — Async/sync function execution measurement, manual timers, threshold management, statistical summaries (min, max, avg, p95, p99), and Node.js CPU/memory/event-loop monitoring.
- **🚨 Error Tracker** — Runtime error capture, stack trace parsing, deterministic FNV-1a error fingerprinting, duplicate deduplication and grouping, without swallowing errors.
- **🌐 Universal Tracker** — Unified event schema, central processing pipeline (validation → filtering → redaction → sampling → storage), correlation IDs, bounded queues, and auto-flush timers.
- **🔒 Privacy & Security by Design** — Configurable field and regex PII redaction, automatic suppression of passwords, secrets, and auth tokens, with zero automatic harvesting of private inputs.
- **🔌 Pluggable Architecture** — Memory and File storage adapters included out-of-the-box, with clean interfaces for MongoDB, Postgres, SQLite, and custom plugins.
- **🚀 Dual Runtime Integrations** — Specialized entry points for Node.js (`trackflow/node`), browsers (`trackflow/browser`), and Express.js (`trackflow/express`).

---

## 📦 Installation

```bash
npm install trackflow
```

### Optional Dependencies
- `chokidar` (optional): For advanced cross-platform file watching in Node.js.
  ```bash
  npm install chokidar
  ```
- `express` (peer dependency): For HTTP request & error middleware.
  ```bash
  npm install express
  ```

---

## 📋 Requirements

- **Node.js**: >= 20.0.0
- **TypeScript**: >= 5.0 (for TypeScript projects)
- **Browsers**: Modern evergreen browsers (Chrome, Firefox, Safari, Edge)

---

## 🚀 Quick Start

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
  redaction: {
    enabled: true,
    fields: ['password', 'secret', 'token'],
  },
});

// 2. Start the tracker lifecycle
await tracker.start();

// 3. Track Object Changes
tracker.changes.track('user_profile', { name: 'Alice', role: 'admin' });
const diffs = tracker.changes.track('user_profile', { name: 'Alice', role: 'superadmin' });
console.log('Detected changes:', diffs);

// 4. Track User Activity
tracker.activities.login('user_123', { method: 'sso' });
tracker.activities.track('order.created', { orderId: 'ord_987', amount: 49.99 });

// 5. Measure Function Performance
const user = await tracker.performance.measure('fetch-user-db', async () => {
  return await database.findUser('user_123');
});

// 6. Capture Application Errors
try {
  throw new Error('Payment gateway timeout');
} catch (err) {
  tracker.errors.capture(err, { gateway: 'stripe', attempt: 1 });
}

// 7. Flush and Gracefully Stop
await tracker.flush();
await tracker.stop();
```

---

## ⚙️ Configuration Reference

```typescript
import { createTracker, type TrackerConfig } from 'trackflow';

const config: Partial<TrackerConfig> = {
  // Application identifier (required)
  appName: 'api-service',

  // Deployment environment
  environment: 'production', // 'development' | 'staging' | 'production'

  // Subsystem toggles
  tracking: {
    changes: true,
    activities: true,
    performance: true,
    errors: true,
  },

  // Storage configuration
  storage: {
    type: 'memory', // 'memory' | 'file' | 'custom'
    options: {
      filePath: './events.ndjson', // used when type === 'file'
    },
  },

  // PII Redaction
  redaction: {
    enabled: true,
    fields: ['password', 'secret', 'token', 'apiKey', 'creditCard'],
    patterns: [/bearer.*/i, /auth.*/i],
    replacement: '[REDACTED]',
  },

  // Queue & Backpressure
  queue: {
    maxSize: 10000,
    dropPolicy: 'oldest', // 'oldest' | 'newest'
  },

  // Probabilistic Sampling
  sampling: {
    rate: 1.0, // 0.0 to 1.0
    rules: {
      performance: 0.5, // sample 50% of performance events
    },
  },

  // Debug logging
  debug: false,
};

const tracker = createTracker(config);
```

---

## 🔍 Core Tracking Modules

### 1. Change Tracker (`tracker.changes`)

Monitors state mutations, deep object graphs, arrays, snapshots, and file changes.

```typescript
// Automatic diffing against last known snapshot
tracker.changes.track('user_settings', { theme: 'dark', notifications: true });
const diffs = tracker.changes.track('user_settings', { theme: 'light', notifications: true });

// Manual comparison between two objects
const diffs = tracker.changes.compare(beforeObj, afterObj, {
  ignoredProperties: ['updatedAt', 'internalId'],
});

// Snapshot management
tracker.changes.snapshot('cart_1', currentCart);
const snapshot = tracker.changes.getSnapshot('cart_1');

// Change history timeline
const history = tracker.changes.history('user_settings', 10);

// File modification watcher (Node.js)
const watcher = await tracker.changes.watchFile('./config.json', (diffs) => {
  console.log('Config modified:', diffs);
});
await watcher.close();
```

---

### 2. Activity Tracker (`tracker.activities`)

Captures user actions, logins, registrations, button clicks, and manages sessions.

```typescript
// Identify user and attach persistent traits
tracker.activities.identify('user_99', { tier: 'pro', department: 'engineering' });

// User authentication helpers
tracker.activities.login('user_99', { method: 'oauth' });
tracker.activities.register('user_99');
tracker.activities.logout('user_99');

// Custom activity events
tracker.activities.track('export.pdf', {
  category: 'reports',
  metadata: { pages: 12 },
});

// UI click events
tracker.activities.click('btn-checkout');

// Session management
const session = tracker.activities.startSession('user_99');
console.log(session.id, session.startedAt);
tracker.activities.endSession();

// Query user timeline
const timeline = tracker.activities.getTimeline('user_99', { limit: 25 });
```

---

### 3. Performance Tracker (`tracker.performance`)

Measures synchronous/asynchronous execution latency, defines performance budgets, and records system statistics.

```typescript
// Measure async operation duration
const users = await tracker.performance.measure('fetch-users', async () => {
  return await db.query('SELECT * FROM users');
});

// Manual timer
const timer = tracker.performance.startTimer('image-resize');
await resizeImage();
const duration = timer.end({ width: 800, height: 600 });

// Threshold budget alerting (logs a warning if exceeded)
tracker.performance.setThreshold('fetch-users', 150); // 150ms

// Query statistical metrics summary
const summary = tracker.performance.getSummary('fetch-users');
console.log(summary);
// Output:
// {
//   operation: 'fetch-users',
//   count: 50,
//   min: 15.2,
//   max: 180.4,
//   avg: 42.1,
//   p95: 110.5,
//   p99: 165.2
// }
```

---

### 4. Error Tracker (`tracker.errors`)

Captures exceptions, parses stack traces, generates deterministic fingerprints, and groups duplicate errors.

```typescript
try {
  processTransaction();
} catch (error) {
  tracker.errors.capture(error, {
    transactionId: 'tx_789',
    userId: 'u_123',
  });
}

// Capture warning or error messages
tracker.errors.captureMessage('External API quota reached 90%');

// Query aggregated error groups
const groups = tracker.errors.getGroups();
for (const group of groups) {
  console.log(`Fingerprint: ${group.fingerprint}`);
  console.log(`Error: ${group.name} - ${group.message}`);
  console.log(`Count: ${group.count} occurrences`);
}
```

---

## 🌐 Specialized Runtimes

### Node.js Integration (`trackflow/node`)

Provides automatic global exception catching (`uncaughtException`, `unhandledRejection`), periodic CPU/memory monitoring, and graceful process shutdown.

```typescript
import { createNodeTracker } from 'trackflow/node';

const { tracker, nodeCollector } = createNodeTracker({
  config: {
    appName: 'node-backend',
    environment: 'production',
  },
  collectorOptions: {
    collectSystemMetrics: true,
    systemMetricsIntervalMs: 30000, // sample CPU & memory every 30s
    handleGracefulShutdown: true,   // flush on SIGINT / SIGTERM
  },
});

await tracker.start();
```

---

### Browser Integration (`trackflow/browser`)

Provides automated browser error listeners (`window.onerror`, `unhandledrejection`), page navigation performance metrics, and UI interaction tracking.

```typescript
import { createBrowserTracker } from 'trackflow/browser';

const { tracker } = createBrowserTracker({
  config: {
    appName: 'web-app',
    environment: 'production',
  },
  interactionOptions: {
    trackClicks: true, // auto-track clicks on buttons, links, and [data-track]
    trackForms: true,  // auto-track form submissions (form values are never captured)
  },
});

await tracker.start();
```

---

### Express.js Integration (`trackflow/express`)

Tracks incoming HTTP request durations, status codes, correlation IDs, and unhandled route exceptions without altering error responses.

```typescript
import express from 'express';
import { createTracker } from 'trackflow';
import { trackflowMiddleware, trackflowErrorMiddleware } from 'trackflow/express';

const app = express();
const tracker = createTracker({ appName: 'express-api' });
await tracker.start();

// Request tracking (injects x-correlation-id header, tracks latency)
app.use(trackflowMiddleware(tracker));

// Routes
app.get('/api/data', (req, res) => res.json({ status: 'ok' }));

// Error tracking (must be placed after routes, before default error handler)
app.use(trackflowErrorMiddleware(tracker));

app.listen(3000);
```

---

## 💾 Storage Architecture

TrackFlow supports pluggable storage via `StorageAdapter`:

1. **`MemoryStorage`** (default) — Bounded in-memory event array with pagination.
2. **`FileStorage`** — Append-only newline-delimited JSON (NDJSON) file on disk.
3. **Custom Adapters** — Implement `StorageAdapter` for databases (PostgreSQL, MongoDB, SQLite):

```typescript
import type { StorageAdapter, TrackerEvent, EventFilter } from 'trackflow';

export class MongoStorage implements StorageAdapter {
  async initialize(): Promise<void> { /* connect */ }
  async save(event: TrackerEvent): Promise<void> { /* insertOne */ }
  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> { /* insertMany */ }
  async query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>> { /* find */ return []; }
  async flush(): Promise<void> { /* no-op */ }
  async close(): Promise<void> { /* disconnect */ }
}
```

---

## 🔌 Custom Plugins

```typescript
import type { TrackFlowPlugin, PluginContext } from 'trackflow';

const myPlugin: TrackFlowPlugin = {
  name: 'audit-log-plugin',
  version: '1.0.0',

  async install(context: PluginContext) {
    // Intercept and enrich events in the pipeline
    context.addProcessor((event) => {
      return {
        ...event,
        data: {
          ...(event.data as Record<string, unknown>),
          auditTagged: true,
        },
      };
    });

    // Listen to internal events
    context.on('event:processed', (event) => {
      // Forward to secondary telemetry destination
    });
  },
};

await tracker.use(myPlugin);
```

---

## 🔒 Security & Privacy

- **No Secret Harvesting** — Passwords, authorization headers, credit cards, SSNs, and secret tokens are redacted by default.
- **Configurable Redaction** — Define custom field names and regular expressions to scrub before events enter storage.
- **Safe Object Traversal** — Recursive traversal guards protect against circular references and prototype pollution.
- **No Request Body Snooping** — Express middleware and Browser collectors never capture request bodies or form passwords by default.

---

## 📊 Performance & Benchmarks

Run the benchmark suite locally:

```bash
npm run benchmark
```

Benchmark results on Apple Silicon (10,000 operations per engine):

| Engine / Component | Throughput | Latency |
|---|---|---|
| **Change Tracker** (`compare`) | **635,000 ops/sec** | 0.0015 ms/op |
| **Performance Tracker** (`record`) | **659,000 ops/sec** | 0.0015 ms/op |
| **Activity Tracker** (`track`) | **369,000 ops/sec** | 0.0027 ms/op |
| **Error Tracker** (`capture` + FNV-1a fingerprint) | **301,000 ops/sec** | 0.0033 ms/op |
| **Universal Pipeline** (Validate → Redact → Queue → Flush) | **173,000 events/sec** | 0.0057 ms/event |

---

## 🧪 Testing

```bash
# Run Vitest test suite
npm test

# Run typecheck
npm run typecheck

# Run linter
npm run lint

# Run all checks (typecheck + lint + test)
npm run check
```

---

## 📄 License

MIT © Nishesh Chaudhary

