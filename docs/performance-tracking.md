# Performance Tracker Module

The Performance Tracker monitors function execution time, API response latency, slow operations, and system health metrics.

## Features

- High-resolution timing via `performance.now()`
- Synchronous and asynchronous function measurement
- Manual stopwatches via `startTimer()`
- Threshold violation detection and logging
- Statistical metrics summaries (count, min, max, avg, p95, p99)
- Node.js CPU and memory collector

## Usage

### Measuring Async Functions

```typescript
const result = await tracker.performance.measure('fetch-products', async () => {
  return await api.get('/products');
});
```

### Manual Timer

```typescript
const timer = tracker.performance.startTimer('image-processing');
await processImage();
const durationMs = timer.end({ imageWidth: 1920, imageHeight: 1080 });
console.log(`Processing took ${durationMs}ms`);
```

### Setting Thresholds

```typescript
// Alert if 'db-query' takes longer than 100ms
tracker.performance.setThreshold('db-query', 100);

await tracker.performance.measure('db-query', async () => {
  // If this takes >100ms, a warning is logged and the event is flagged as exceeded
  return await db.query('SELECT * FROM large_table');
});
```

### Statistical Summaries

```typescript
// Retrieve aggregated metrics for a specific operation
const summary = tracker.performance.getSummary('db-query');
console.log(summary);
// {
//   operation: 'db-query',
//   count: 150,
//   min: 12.4,
//   max: 230.1,
//   avg: 45.2,
//   p95: 98.7,
//   p99: 185.3
// }
```
