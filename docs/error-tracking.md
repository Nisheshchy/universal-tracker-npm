# Error Tracker Module

The Error Tracker captures, parses, fingerprints, and aggregates application exceptions without modifying application flow or swallowing errors.

## Features

- Runtime exception and unhandled rejection tracking
- Automatic stack trace parsing
- Deterministic error fingerprinting via FNV-1a hashing
- Duplicate error grouping and count aggregation
- Context enrichment (components, user IDs, request paths)
- Configurable error filtering

## Usage

### Capturing Errors

```typescript
try {
  await paymentGateway.charge(order);
} catch (error) {
  tracker.errors.capture(error, {
    orderId: 'ord_123',
    gateway: 'stripe',
    retryAttempt: 2,
  });
  // You can still rethrow or handle the error
  throw error;
}
```

### Capturing Non-Exception Messages

```typescript
tracker.errors.captureMessage('Rate limit reached on external API', {
  provider: 'WeatherService',
});
```

### Error Grouping & Inspection

```typescript
// Get all aggregated error groups
const groups = tracker.errors.getGroups();
for (const group of groups) {
  console.log(`Fingerprint: ${group.fingerprint}`);
  console.log(`Message: ${group.message}`);
  console.log(`Occurrences: ${group.count}`);
  console.log(`First seen: ${group.firstSeen}`);
  console.log(`Last seen: ${group.lastSeen}`);
}

// Get raw error history
const history = tracker.errors.getHistory(50);
```

### Error Filtering

```typescript
const tracker = createTracker({
  // Filter out benign or expected errors
  tracking: { errors: true },
});

// Or dynamically configure filter:
const customTracker = new ErrorTracker({
  filter: (parsed) => parsed.name !== 'AbortError',
});
```

