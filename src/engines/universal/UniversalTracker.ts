import type {
  TrackerConfig,
  TrackerEvent,
  EventFilter,
  StorageAdapter,
} from '../../types/index.js';
import { createConfig, validateConfig } from '../../core/Config.js';
import { EventBus } from '../../core/EventBus.js';
import { Logger } from '../../core/Logger.js';
import { CorrelationManager } from '../../core/CorrelationManager.js';
import { LifecycleManager, type LifecycleState } from '../../core/LifecycleManager.js';
import { EventProcessor } from '../../core/EventProcessor.js';
import { EventQueue } from '../../core/EventQueue.js';
import { PluginManager } from '../../plugins/PluginManager.js';
import type { TrackFlowPlugin } from '../../plugins/PluginInterface.js';
import { MemoryStorage } from '../../storage/MemoryStorage.js';
import { FileStorage } from '../../storage/FileStorage.js';
import { JSONExporter } from '../../exporters/JSONExporter.js';

import { ChangeTracker } from '../change/ChangeTracker.js';
import { ActivityTracker } from '../activity/ActivityTracker.js';
import { PerformanceTracker } from '../performance/PerformanceTracker.js';
import { ErrorTracker } from '../error/ErrorTracker.js';

export interface TrackerStatus {
  readonly state: LifecycleState;
  readonly appName: string;
  readonly environment: string;
  readonly queueSize: number;
  readonly plugins: readonly string[];
  readonly storageType: string;
}

export class UniversalTracker {
  readonly config: TrackerConfig;
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly correlation: CorrelationManager;
  readonly lifecycle: LifecycleManager;
  readonly storage: StorageAdapter;
  readonly processor: EventProcessor;
  readonly queue: EventQueue;
  readonly plugins: PluginManager;

  // The four core tracking engines
  readonly changes: ChangeTracker;
  readonly activities: ActivityTracker;
  readonly performance: PerformanceTracker;
  readonly errors: ErrorTracker;

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
      this.storage = customStorage;
    } else if (this.config.storage?.type === 'file') {
      const filePath =
        (this.config.storage.options?.filePath as string) ?? './trackflow-events.ndjson';
      this.storage = new FileStorage(filePath);
    } else {
      this.storage = new MemoryStorage();
    }

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
      },
      this.processor,
      this.logger,
    );

    this.plugins = new PluginManager(this.eventBus, this.config, this.logger);

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

    // Wire up event creation to the queue
    this.eventBus.on('event:created', (eventUnknown: unknown) => {
      const event = eventUnknown as TrackerEvent;
      this.queue.enqueue(event);
    });

    // Register lifecycle start and stop handlers
    this.lifecycle.onStart(async () => {
      await this.storage.initialize();
      // Start auto flush every 2 seconds by default
      this.queue.startAutoFlush(2000);
      this.logger.info(`TrackFlow started for app "${this.config.appName}"`);
    });

    this.lifecycle.onStop(async () => {
      this.queue.stopAutoFlush();
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
   * Stop the tracker, flush all queues, and release resources.
   */
  async stop(): Promise<void> {
    await this.lifecycle.stop();
  }

  /**
   * Manually flush all queued events through the processing pipeline.
   */
  async flush(): Promise<void> {
    await this.queue.flush();
  }

  /**
   * Install and activate a plugin.
   */
  async use(plugin: TrackFlowPlugin): Promise<void> {
    await this.plugins.register(plugin);
    // Wire custom processors from plugins into the event processor
    for (const proc of this.plugins.getProcessors()) {
      this.processor.addProcessor(proc);
    }
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
   * Query recorded events from storage.
   */
  async query(filters: EventFilter = {}): Promise<ReadonlyArray<TrackerEvent>> {
    return this.storage.query(filters);
  }

  /**
   * Export stored events in JSON format.
   */
  async export(format: 'json' = 'json'): Promise<string> {
    const events = await this.query({ limit: 10_000 });
    if (format === 'json') {
      const exporter = new JSONExporter();
      return exporter.export([...events]);
    }
    throw new Error(`Unsupported export format: ${format}`);
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
