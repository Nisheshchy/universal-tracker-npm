# TrackFlow API Reference

## `createTracker(config?, storage?): UniversalTracker`

Factory function to create an instance of `UniversalTracker`.

---

## `UniversalTracker` Class

### Properties
- `changes: ChangeTracker` — Change tracking engine.
- `activities: ActivityTracker` — Activity tracking engine.
- `performance: PerformanceTracker` — Performance tracking engine.
- `errors: ErrorTracker` — Error tracking engine.
- `config: TrackerConfig` — Resolved configuration object.
- `logger: Logger` — Internal logger instance.
- `eventBus: EventBus` — Central pub/sub event bus.
- `storage: StorageAdapter` — Configured storage adapter.
- `queue: EventQueue` — In-memory bounded queue.

### Methods
- `start(): Promise<void>` — Starts background services and auto-flush timer.
- `stop(): Promise<void>` — Flushes queues, stops timers, and closes storage.
- `flush(): Promise<void>` — Immediately flushes queued events to storage.
- `use(plugin: TrackFlowPlugin): Promise<void>` — Registers a plugin.
- `identify(userId: string, traits?: Record<string, unknown>): void` — Sets current user identity.
- `setCorrelationId(id: string): void` — Sets explicit correlation ID.
- `getCorrelationId(): string` — Returns current correlation ID.
- `setSessionId(id: string): void` — Sets current session ID.
- `getSessionId(): string | undefined` — Returns current session ID.
- `query(filters?: EventFilter): Promise<ReadonlyArray<TrackerEvent>>` — Queries events from storage.
- `export(format?: 'json'): Promise<string>` — Exports stored events.
- `getStatus(): TrackerStatus` — Returns current health and runtime status.

---

## Integrations

### `createNodeTracker(options)` (`trackflow/node`)
Initializes `UniversalTracker` with automatic `uncaughtException`, `unhandledRejection`, and CPU/memory system metrics collection.

### `createBrowserTracker(options)` (`trackflow/browser`)
Initializes `UniversalTracker` with automatic `window.onerror`, `unhandledrejection`, page navigation timing, and UI click interaction listeners.

### `trackflowMiddleware(tracker, options)` (`trackflow/express`)
Express middleware that traces HTTP requests, response latency, status codes, and correlation IDs.

### `trackflowErrorMiddleware(tracker)` (`trackflow/express`)
Express error middleware that captures unhandled route errors without swallowing them.

