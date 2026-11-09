# Advanced Correlation & Distributed Tracing

TrackFlow provides an end-to-end event correlation and distributed tracing system connecting user interactions, API requests, database queries, and background errors.

## W3C Trace Context Propagation

TrackFlow natively supports the [W3C Trace Context specification](https://www.w3.org/TR/trace-context/):

- `00-${traceId}-${spanId}-${flags}`
- **traceId**: 32-character hexadecimal globally unique identifier.
- **spanId**: 16-character hexadecimal span identifier.

### Inspecting and Parsing Traceparents

```typescript
import { parseTraceparent, formatTraceparent } from 'trackflow';

const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const parsed = parseTraceparent(header);
console.log(parsed?.traceId);  // '4bf92f3577b34da6a3ce929d0e0e4736'
console.log(parsed?.parentId); // '00f067aa0ba902b7'
```

## Asynchronous Context Tracing (`runWithContext`)

In Node.js applications, TrackFlow uses `node:async_hooks` (`AsyncLocalStorage`) so that downstream asynchronous function calls automatically inherit the active trace context without requiring explicit parameter passing:

```typescript
tracker.runWithContext(
  {
    correlationId: 'req-order-1234',
    userId: 'user_882',
    metadata: { route: '/checkout' },
  },
  async () => {
    // 1. Database query automatically has correlationId 'req-order-1234'
    await tracker.performance.measure('db.findUser', async () => {
      return db.find({ id: 'user_882' });
    });

    // 2. Any error captured inherits user_882 and req-order-1234
    try {
      await chargeCard();
    } catch (err) {
      tracker.errors.capture(err);
    }
  }
);
```

## Hierarchical Parent-Child Spans

To track child operations within a parent span:

```typescript
const child = tracker.correlation.createChildSpan();
// child.traceId === parent traceId
// child.parentId === parent spanId
// child.spanId === newly generated 16-hex span
```

## Reconstructing Application Timelines (`getTimeline`)

Given a `correlationId`, TrackFlow reconstructs the complete lifecycle sequence:

```typescript
const timeline = await tracker.getTimeline('req-order-1234');

console.log(`Duration: ${timeline.totalDurationMs}ms`);
console.log(`Events: ${timeline.summary.totalEvents}`);
console.log(`Errors: ${timeline.summary.errorCount}`);

// Hierarchical span tree:
for (const node of timeline.tree) {
  console.log(`- [${node.type}] ${node.event.source ?? 'root'} (${node.durationMs ?? 0}ms)`);
  for (const child of node.children) {
    console.log(`  -> [${child.type}] ${child.event.source}`);
  }
}
```

