# Storage Architecture

TrackFlow uses a pluggable storage adapter architecture via the `StorageAdapter` interface.

## Available Storage Adapters

### 1. MemoryStorage (Default)
Stores events in a bounded in-memory array. Ideal for serverless, browser applications, or unit tests.

```typescript
import { createTracker, MemoryStorage } from 'trackflow';

const memoryStorage = new MemoryStorage(10_000); // max 10,000 events
const tracker = createTracker({}, memoryStorage);
```

### 2. FileStorage (Node.js)
Appends events to a newline-delimited JSON (NDJSON) file on disk.

```typescript
import { createTracker } from 'trackflow';

const tracker = createTracker({
  storage: {
    type: 'file',
    options: {
      filePath: './data/trackflow-events.ndjson',
    },
  },
});
```

---

## Custom Storage Adapters

To persist events to MongoDB, PostgreSQL, SQLite, DynamoDB, or Redis, implement the `StorageAdapter` interface:

```typescript
import type { StorageAdapter, TrackerEvent, EventFilter } from 'trackflow';

export class PostgresStorage implements StorageAdapter {
  async initialize(): Promise<void> {
    // Connect to database, run migrations, create tables
  }

  async save(event: TrackerEvent): Promise<void> {
    // INSERT INTO events (id, type, timestamp, data) VALUES (...)
  }

  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> {
    // Bulk INSERT
  }

  async query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>> {
    // SELECT * FROM events WHERE ... ORDER BY timestamp DESC LIMIT ...
    return [];
  }

  async flush(): Promise<void> {
    // Commit transactions / flush write buffer
  }

  async close(): Promise<void> {
    // Disconnect pool
  }
}
```

Pass your custom adapter to `createTracker`:

```typescript
const tracker = createTracker(config, new PostgresStorage());
```

