# Advanced Plugin Architecture

TrackFlow provides an extensible, battle-tested plugin system allowing developers to customize event processing, register custom collectors, hook into lifecycle stages, and inject storage adapters with full error isolation.

## The `TrackFlowPlugin` Interface

```typescript
import type { TrackFlowPlugin, PluginContext, TrackerEvent } from 'trackflow';

export interface TrackFlowPlugin {
  readonly name: string;
  readonly version?: string;
  readonly dependencies?: readonly string[];

  install(context: PluginContext): void | Promise<void>;
  uninstall?(context?: PluginContext): void | Promise<void>;

  // Lifecycle Hooks
  beforeProcess?(event: TrackerEvent): TrackerEvent | null;
  afterProcess?(event: TrackerEvent): void;
  beforeFlush?(events: TrackerEvent[]): TrackerEvent[];
  onError?(error: unknown, stage: string): void;
  onEvent?(event: TrackerEvent): void;
}
```

## Plugin Lifecycle Hooks

1. **`install(context)`**: Invoked during `tracker.use(plugin)`. Use this to initialize network connections, register processors, or start custom collectors.
2. **`uninstall(context)`**: Invoked during `tracker.removePlugin(name)` or during graceful `tracker.stop()`. Cleans up connections, timers, and unbinds listeners.
3. **`beforeProcess(event)`**: Pre-processing hook invoked before an event enters the storage pipeline. Return modified event or `null` to drop it.
4. **`afterProcess(event)`**: Invoked immediately after an event is successfully persisted to storage.
5. **`beforeFlush(events)`**: Invoked before a batch is flushed. Allows reordering or modifying batch payloads.
6. **`onError(error, stage)`**: Invoked when an error occurs during validation, processing, or persistence.
7. **`onEvent(event)`**: Invoked immediately when any tracking engine produces a new event.

## Dependency Validation

If your plugin relies on another plugin being installed first, declare `dependencies`:

```typescript
export const auditLedgerPlugin: TrackFlowPlugin = {
  name: 'audit-ledger',
  dependencies: ['auth-session-plugin'],
  async install(context) {
    const authPlugin = context.getPlugin('auth-session-plugin');
    context.logger.info(`Initialized with auth plugin: ${authPlugin?.name}`);
  },
};
```

If a required dependency is missing when `tracker.use()` is called, TrackFlow throws a descriptive `Error: Plugin "audit-ledger" requires dependency "auth-session-plugin" to be registered first.`

## Custom Collectors & Storage Adapters

Plugins can register background collectors and storage adapters directly via `context`:

```typescript
export const customMetricsPlugin: TrackFlowPlugin = {
  name: 'custom-metrics',
  install(context) {
    let interval: NodeJS.Timeout;

    // Managed collector lifecycle
    context.addCollector({
      start() {
        interval = setInterval(() => {
          // Poll custom internal service metrics
        }, 15_000);
      },
      stop() {
        clearInterval(interval);
      },
    });

    // Custom storage override
    // context.setStorageAdapter(new S3StorageAdapter());
  },
};
```

When the plugin is removed via `tracker.removePlugin('custom-metrics')`, the collector's `stop()` hook is automatically invoked and its event listeners are unbound.

## Complete Error Isolation

TrackFlow guarantees that **a misbehaving or throwing plugin will never crash the host application**. Any unhandled exception in `install`, `uninstall`, or lifecycle hooks is caught, logged via structured logging, emitted via `plugin:error`, and isolated.
