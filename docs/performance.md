# Performance & Optimization Guide

TrackFlow is designed for high-throughput environments with sub-millisecond overhead per event.

## Queue Bounds & Backpressure

To prevent unbounded memory growth, TrackFlow enforces queue limits:

```typescript
const tracker = createTracker({
  queue: {
    maxSize: 10_000,
    // Eviction policy when queue reaches maxSize:
    // 'oldest' - Discard oldest event (FIFO eviction)
    // 'newest' - Reject incoming event with a warning
    // 'reject' - Throw QueueOverflowError
    dropPolicy: 'oldest',
    // Retry attempts when storage flush fails
    maxRetries: 3,
    retryBaseDelayMs: 50,
    retryMaxDelayMs: 1_000,
  },
});
```

## Event Prioritization

Events can specify an `EventPriority`:
- `'critical'` (highest): placed at front of queue.
- `'high'`
- `'normal'` (default)
- `'low'`

Critical events and error events automatically bypass probabilistic sampling to guarantee telemetry delivery.

## Event Deduplication

When high-frequency identical events occur (e.g. repeated heartbeats or network retries), enable deduplication:

```typescript
const tracker = createTracker({
  deduplication: {
    enabled: true,
    ttlMs: 5_000,    // Deduplication sliding window (5 seconds)
    maxSize: 1_000,  // Max unique fingerprints in cache
  },
});
```

## Offline Buffering & Transient Failure Recovery

If your storage backend goes down (e.g., PostgreSQL or MongoDB connection drops):
1. The `EventQueue` retries the batch up to `maxRetries` with exponential backoff and jitter.
2. If all retries fail, events are automatically diverted into the `OfflineBuffer`.
3. When storage recovers, events are drained in FIFO order.
4. Poison-pill protection automatically drops events that repeatedly fail to prevent memory starvation.

## Operational Metrics (`getMetrics`)

```typescript
const metrics = tracker.getMetrics();
console.log({
  uptime: metrics.uptimeSeconds,
  enqueued: metrics.queue.enqueued,
  processed: metrics.processor.processed,
  dropped: metrics.queue.dropped,
  redacted: metrics.processor.redacted,
  deduplicated: metrics.processor.deduplicated,
  flushLatencyMs: metrics.queue.avgFlushDurationMs,
  offlineBufferSize: metrics.offlineBuffer.size,
});
```

## Benchmarks Summary

Run benchmarks locally using:
```bash
npm run benchmark
```

Typical performance on standard hardware (Node.js v20+):
- **Baseline Overhead**: < 8% CPU overhead between tracking enabled vs disabled.
- **Queue & Batch Processing**: > 120,000 events/second (batch size 200).
- **High-Volume Redaction Pipeline**: > 80,000 events/second with sensitive field redaction and email masking.
- **Deep Object Comparison**: > 850 comparisons/second for 1,000-property nested objects.

