import type {
  TrackerConfig,
  TrackerEvent,
  EventFilter,
  StorageAdapter,
  PerformanceEventData,
} from '../../types/index.js';
import { createConfig, validateConfig } from '../../core/Config.js';
import { EventBus } from '../../core/EventBus.js';
import { Logger } from '../../core/Logger.js';
import {
  CorrelationManager,
  type CorrelationContext,
} from '../../core/CorrelationManager.js';
import { LifecycleManager, type LifecycleState } from '../../core/LifecycleManager.js';
import { EventProcessor } from '../../core/EventProcessor.js';
import { EventQueue } from '../../core/EventQueue.js';
import { OfflineBuffer } from '../../core/OfflineBuffer.js';
import { RetentionManager } from '../../core/RetentionManager.js';
import { PluginManager } from '../../plugins/PluginManager.js';
import type { TrackFlowPlugin } from '../../plugins/PluginInterface.js';
import { MemoryStorage } from '../../storage/MemoryStorage.js';
import { FileStorage } from '../../storage/FileStorage.js';
import { validateStorageAdapter } from '../../storage/StorageAdapter.js';
import { JSONExporter } from '../../exporters/JSONExporter.js';

import { ChangeTracker } from '../change/ChangeTracker.js';
import { ActivityTracker } from '../activity/ActivityTracker.js';
import { PerformanceTracker } from '../performance/PerformanceTracker.js';
import { ErrorTracker } from '../error/ErrorTracker.js';

export interface ExportOptions {
  format?: 'json';
  type?: TrackerEvent['type'];
  userId?: string;
  source?: string;
  correlationId?: string;
  traceId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  pretty?: boolean;
  includeMetadata?: boolean;
}

export interface TrackerStatus {
  readonly state: LifecycleState;
  readonly appName: string;
  readonly environment: string;
  readonly queueSize: number;
  readonly offlineBufferSize: number;
  readonly plugins: readonly string[];
  readonly storageType: string;
}

export interface TimelineSpanNode {
  readonly id: string;
  readonly type: TrackerEvent['type'];
  readonly timestamp: string;
  readonly source?: string;
  readonly spanId?: string;
  readonly parentId?: string;
  readonly durationMs?: number;
  readonly event: TrackerEvent;
  readonly children: TimelineSpanNode[];
}

export interface EventTimeline {
  readonly correlationId: string;
  readonly events: ReadonlyArray<TrackerEvent>;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly totalDurationMs: number;
  readonly tree: TimelineSpanNode[];
  readonly summary: {
    readonly totalEvents: number;
    readonly byType: Record<string, number>;
    readonly errorCount: number;
  };
}

export interface TrackerMetrics {
  readonly uptimeSeconds: number;
  readonly queue: {
    readonly size: number;
    readonly enqueued: number;
    readonly dropped: number;
    readonly flushCount: number;
    readonly flushErrors: number;
    readonly avgFlushDurationMs: number;
  };
  readonly processor: {
    readonly processed: number;
    readonly filtered: number;
    readonly redacted: number;
    readonly sampledOut: number;
    readonly deduplicated: number;
    readonly errors: number;
  };
  readonly offlineBuffer: {
    readonly size: number;
    readonly deadLetters: number;
  };
  readonly memory?: {
    readonly rss: number;
    readonly heapTotal: number;
    readonly heapUsed: number;
    readonly external: number;
  };
}

export class UniversalTracker {
  readonly config: TrackerConfig;
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly correlation: CorrelationManager;
  readonly lifecycle: LifecycleManager;
  storage: StorageAdapter;
  readonly processor: EventProcessor;
  readonly queue: EventQueue;
  readonly offlineBuffer: OfflineBuffer;
  readonly retentionManager?: RetentionManager;
  readonly plugins: PluginManager;

  // The four core tracking engines
  readonly changes: ChangeTracker;
  readonly activities: ActivityTracker;
  readonly performance: PerformanceTracker;
  readonly errors: ErrorTracker;

  private readonly startedAt: number = Date.now();

  constructor(userConfig?: Partial<TrackerConfig>, customStorage?: StorageAdapter) {
    this.config = createConfig(userConfig ?? {});
    const errors = validateConfig(this.config);
    if (errors.length > 0) {
      throw new Error(`Invalid TrackFlow configuration: ${errors.join('; ')}`);
    }

    const logLevel = this.config.debug ? 'debug' : 'warn';
    this.logger = new Logger(logLevel);
    this.eventBus = new EventBus();
    this.correlation = new CorrelationManager();
    this.lifecycle = new LifecycleManager(this.eventBus, this.logger);

    // Resolve storage adapter
    if (customStorage) {
      const missing = validateStorageAdapter(customStorage);
      if (missing.length > 0) {
        throw new Error(`Invalid custom StorageAdapter: ${missing.join(', ')}`);
      }
      this.storage = customStorage;
    } else if (this.config.storage?.type === 'file') {
      const filePath =
        (this.config.storage.options?.filePath as string) ?? './trackflow-events.ndjson';
      this.storage = new FileStorage(filePath);
    } else {
      this.storage = new MemoryStorage();
    }

    this.offlineBuffer = new OfflineBuffer(this.logger);

    this.processor = new EventProcessor(
      this.config,
      this.storage,
      this.logger,
      this.eventBus,
    );

    this.queue = new EventQueue(
      {
        maxSize: this.config.queue?.maxSize ?? 10_000,
        dropPolicy: this.config.queue?.dropPolicy ?? 'oldest',
        maxRetries: this.config.queue?.maxRetries ?? 3,
        retryBaseDelayMs: this.config.queue?.retryBaseDelayMs ?? 50,
        retryMaxDelayMs: this.config.queue?.retryMaxDelayMs ?? 1_000,
      },
      this.processor,
      this.logger,
      this.offlineBuffer,
    );

    this.plugins = new PluginManager(this.eventBus, this.config, this.logger);
    this.plugins.setStorageChangeHandler((adapter: StorageAdapter) => {
      this.storage = adapter;
    });

    if (this.config.retention?.enabled) {
      this.retentionManager = new RetentionManager(
        this.config.retention,
        this.storage,
        this.logger,
      );
    }

    // Instantiate core tracking engines with dependencies
    this.changes = new ChangeTracker(undefined, {
      eventBus: this.eventBus,
      logger: this.logger,
      config: this.config,
    });

    this.activities = new ActivityTracker(undefined, {
      eventBus: this.eventBus,
      logger: this.logger,
      correlationManager: this.correlation,
      config: this.config,
    });

    this.performance = new PerformanceTracker(undefined, {
      eventBus: this.eventBus,
      logger: this.logger,
      correlationManager: this.correlation,
      config: this.config,
    });

    this.errors = new ErrorTracker(undefined, {
      eventBus: this.eventBus,
      logger: this.logger,
      correlationManager: this.correlation,
      config: this.config,
    });

    // Wire up event creation to the queue and plugin hook
    this.eventBus.on('event:created', (eventUnknown: unknown) => {
      const event = eventUnknown as TrackerEvent;

      // Attach correlation metadata & tracing IDs if not already present
      const context = this.correlation.createContext();
      if (!event.correlationId && context.correlationId) {
        (event as { correlationId?: string }).correlationId = context.correlationId;
      }
      if (!event.traceId && context.traceId) {
        (event as { traceId?: string }).traceId = context.traceId;
      }
      if (!event.spanId && context.spanId) {
        (event as { spanId?: string }).spanId = context.spanId;
      }
      if (!event.parentId && context.parentId) {
        (event as { parentId?: string }).parentId = context.parentId;
      }
      if (!event.userId && context.userId) {
        (event as { userId?: string }).userId = context.userId;
      }

      this.plugins.executeOnEvent(event);

      // Run plugin beforeProcess hooks
      const transformed = this.plugins.runBeforeProcess(event);
      if (transformed !== null) {
        this.queue.enqueue(transformed);
      }
    });

    this.eventBus.on('event:processed', (eventUnknown: unknown) => {
      const event = eventUnknown as TrackerEvent;
      this.plugins.runAfterProcess(event);
    });

    // Register lifecycle start and stop handlers
    this.lifecycle.onStart(async () => {
      await this.storage.initialize();
      // Start auto flush every 2 seconds by default
      this.queue.startAutoFlush(2000);
      this.retentionManager?.start();
      this.logger.info(`TrackFlow started for app "${this.config.appName}"`);
    });

    this.lifecycle.onStop(async () => {
      this.queue.stopAutoFlush();
      this.retentionManager?.stop();

      // Drain offline buffer and flush remaining events
      try {
        await this.offlineBuffer.drain(this.storage);
      } catch (err) {
        this.logger.warn('Error draining offline buffer during shutdown', err);
      }

      await this.flush();
      await this.storage.flush();
      await this.storage.close();
      this.logger.info('TrackFlow stopped');
    });
  }

  /**
   * Start the tracker and initialize background services.
   */
  async start(): Promise<void> {
    await this.lifecycle.start();
  }

  /**
   * Stop the tracker with an optional timeout, flush all queues, drain buffers,
   * uninstall plugins, and release resources.
   */
  async stop(options?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? this.config.stopTimeoutMs ?? 5_000;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`TrackFlow shutdown timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      if (typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
    });

    try {
      await Promise.race([
        (async () => {
          // Uninstall all plugins
          for (const plugin of this.plugins.getPlugins()) {
            await this.plugins.unregister(plugin.name);
          }
          await this.lifecycle.stop();
        })(),
        timeoutPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Manually flush all queued events and attempt to drain offline buffer.
   */
  async flush(): Promise<void> {
    // Run plugin beforeFlush hooks
    await this.queue.flush();
    try {
      await this.offlineBuffer.drain(this.storage);
    } catch (err) {
      this.logger.warn('Could not drain offline buffer during flush', err);
    }
  }

  /**
   * Install and activate a plugin.
   */
  async use(plugin: TrackFlowPlugin): Promise<void> {
    await this.plugins.register(plugin);
    for (const proc of this.plugins.getProcessors()) {
      this.processor.addProcessor(proc);
    }
  }

  /**
   * Uninstall and remove a plugin by name.
   */
  async removePlugin(name: string): Promise<void> {
    await this.plugins.unregister(name);
  }

  /**
   * Set user identity.
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    this.correlation.setUserId(userId);
    this.activities.identify(userId, traits);
  }

  /**
   * Set explicit correlation ID for subsequent operations.
   */
  setCorrelationId(id: string): void {
    this.correlation.setCorrelationId(id);
  }

  /**
   * Get active correlation ID.
   */
  getCorrelationId(): string {
    return this.correlation.getCorrelationId();
  }

  /**
   * Set explicit session ID.
   */
  setSessionId(id: string): void {
    this.correlation.setSessionId(id);
  }

  /**
   * Get active session ID.
   */
  getSessionId(): string | undefined {
    return this.correlation.getSessionId();
  }

  /**
   * Set context from an incoming W3C traceparent header.
   */
  setTraceparent(header: string): boolean {
    return this.correlation.setTraceparent(header);
  }

  /**
   * Get W3C traceparent header for distributed context propagation.
   */
  getTraceparent(flags = '01'): string {
    return this.correlation.getTraceparent(flags);
  }

  /**
   * Run an asynchronous callback within an isolated correlation context
   * (powered by AsyncLocalStorage in Node.js).
   */
  runWithContext<R>(context: Partial<CorrelationContext>, callback: () => R): R {
    return this.correlation.runWithContext(context, callback);
  }

  /**
   * Query recorded events from storage.
   */
  async query(filters: EventFilter = {}): Promise<ReadonlyArray<TrackerEvent>> {
    return this.storage.query(filters);
  }

  /**
   * Reconstruct the full timeline of events associated with a correlation ID.
   * Builds duration statistics, event distributions, and hierarchical span trees.
   */
  async getTimeline(correlationId: string): Promise<EventTimeline> {
    const rawEvents = await this.storage.query({ correlationId, limit: 10_000 });
    const events = [...rawEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const startTime = events.length > 0 ? events[0]?.timestamp : undefined;
    const endTime = events.length > 0 ? events[events.length - 1]?.timestamp : undefined;

    let totalDurationMs = 0;
    if (startTime && endTime) {
      totalDurationMs = Math.max(0, Date.parse(endTime) - Date.parse(startTime));
    }

    const byType: Record<string, number> = {};
    let errorCount = 0;

    for (const ev of events) {
      byType[ev.type] = (byType[ev.type] ?? 0) + 1;
      if (ev.type === 'error') {
        errorCount++;
      }
    }

    // Build hierarchical span tree
    const nodeMap = new Map<string, TimelineSpanNode>();
    const rootNodes: TimelineSpanNode[] = [];

    for (const ev of events) {
      const perfData = ev.type === 'performance' ? (ev.data as PerformanceEventData) : undefined;
      const node: TimelineSpanNode = {
        id: ev.id,
        type: ev.type,
        timestamp: ev.timestamp,
        source: ev.source,
        spanId: ev.spanId,
        parentId: ev.parentId,
        durationMs: perfData?.duration,
        event: ev,
        children: [],
      };
      nodeMap.set(ev.spanId ?? ev.id, node);
    }

    for (const node of nodeMap.values()) {
      const parentNode = node.parentId ? nodeMap.get(node.parentId) : undefined;
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    return {
      correlationId,
      events,
      startTime,
      endTime,
      totalDurationMs,
      tree: rootNodes,
      summary: {
        totalEvents: events.length,
        byType,
        errorCount,
      },
    };
  }

  /**
   * Export stored events filtered by type, date range, user ID, etc.
   */
  async export(formatOrOptions: 'json' | ExportOptions = 'json'): Promise<string> {
    const options: ExportOptions =
      typeof formatOrOptions === 'string' ? { format: formatOrOptions } : formatOrOptions;

    const filters: EventFilter = {
      type: options.type,
      userId: options.userId,
      source: options.source,
      correlationId: options.correlationId,
      traceId: options.traceId,
      startTime: options.startTime,
      endTime: options.endTime,
      limit: options.limit ?? 10_000,
      offset: options.offset,
    };

    const events = await this.query(filters);
    const format = options.format ?? 'json';

    if (format === 'json') {
      const exporter = new JSONExporter({
        pretty: options.pretty ?? true,
        includeMetadata: options.includeMetadata ?? false,
      });
      return exporter.export([...events]);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Get current tracker operational metrics and resource consumption.
   */
  getMetrics(): TrackerMetrics {
    const qMetrics = this.queue.getMetrics();
    const pMetrics = this.processor.getMetrics();

    let memory: TrackerMetrics['memory'] | undefined;
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
      const mem = process.memoryUsage();
      memory = {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      };
    }

    return {
      uptimeSeconds: (Date.now() - this.startedAt) / 1000,
      queue: {
        size: this.queue.size(),
        enqueued: qMetrics.enqueued,
        dropped: qMetrics.dropped,
        flushCount: qMetrics.flushCount,
        flushErrors: qMetrics.flushErrors,
        avgFlushDurationMs: qMetrics.avgFlushDurationMs,
      },
      processor: {
        processed: pMetrics.processed,
        filtered: pMetrics.filtered,
        redacted: pMetrics.redacted,
        sampledOut: pMetrics.sampledOut,
        deduplicated: pMetrics.deduplicated,
        errors: pMetrics.errors,
      },
      offlineBuffer: {
        size: this.offlineBuffer.size(),
        deadLetters: this.offlineBuffer.getDeadLetters(),
      },
      memory,
    };
  }

  /**
   * Get current tracker status summary.
   */
  getStatus(): TrackerStatus {
    return {
      state: this.lifecycle.getState(),
      appName: this.config.appName,
      environment: this.config.environment,
      queueSize: this.queue.size(),
      offlineBufferSize: this.offlineBuffer.size(),
      plugins: this.plugins.getPlugins().map((p) => p.name),
      storageType: this.config.storage?.type ?? 'memory',
    };
  }
}

/**
 * Factory function to instantiate a TrackFlow tracker.
 */
export function createTracker(
  config?: Partial<TrackerConfig>,
  storage?: StorageAdapter,
): UniversalTracker {
  return new UniversalTracker(config, storage);
}
