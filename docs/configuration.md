# TrackFlow Configuration

TrackFlow is configured through `TrackerConfig` when calling `createTracker(config)`.

## Full Configuration Reference

```typescript
import { createTracker } from 'trackflow';

const tracker = createTracker({
  // Required application identifier
  appName: 'my-app',

  // Deployment environment label
  environment: 'production', // 'development' | 'staging' | 'production'

  // Enable / disable individual tracking engines
  tracking: {
    changes: true,
    activities: true,
    performance: true,
    errors: true,
  },

  // Storage backend configuration
  storage: {
    type: 'memory', // 'memory' | 'file' | 'custom'
    options: {
      filePath: './trackflow-events.ndjson', // used when type === 'file'
    },
  },

  // Security & Sensitive Data Redaction
  redaction: {
    enabled: true,
    fields: ['password', 'secret', 'token', 'apiKey', 'creditCard'],
    patterns: [/auth.*/i, /bearer.*/i],
    replacement: '[REDACTED]',
  },

  // In-Memory Queue & Backpressure
  queue: {
    maxSize: 10000,
    dropPolicy: 'oldest', // 'oldest' | 'newest'
  },

  // Probabilistic Sampling
  sampling: {
    rate: 1.0, // 0.0 (drop all) to 1.0 (keep all)
    rules: {
      performance: 0.5, // sample only 50% of performance events
    },
  },

  // Global metadata attached to all emitted events
  metadata: {
    version: '1.2.0',
    region: 'us-east-1',
  },

  // Verbose internal logging
  debug: false,
});
```
