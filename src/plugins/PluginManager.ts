import type { EventBus } from '../core/EventBus.js';
import type { Logger } from '../core/Logger.js';
import type { TrackerConfig, TrackerEvent, StorageAdapter } from '../types/index.js';
import type {
  TrackFlowPlugin,
  PluginContext,
  PluginCollector,
} from './PluginInterface.js';

interface PluginRecord {
  readonly plugin: TrackFlowPlugin;
  readonly context: PluginContext;
  readonly processors: Array<(event: TrackerEvent) => TrackerEvent | null>;
  readonly collectors: PluginCollector[];
  readonly listeners: Array<{ event: string; handler: (...args: unknown[]) => void }>;
}

/**
 * Manages the full lifecycle of TrackFlow plugins with complete error isolation,
 * dependency checking, hook execution, and resource cleanup.
 */
export class PluginManager {
  private readonly records: Map<string, PluginRecord> = new Map();
  private readonly eventBus: EventBus;
  private readonly config: TrackerConfig;
  private readonly logger: Logger;
  private onStorageAdapterChange?: (adapter: StorageAdapter) => void;

  constructor(eventBus: EventBus, config: TrackerConfig, logger: Logger) {
    this.eventBus = eventBus;
    this.config = config;
    this.logger = logger;
  }

  /** Set optional handler when a plugin registers a custom storage adapter. */
  setStorageChangeHandler(handler: (adapter: StorageAdapter) => void): void {
    this.onStorageAdapterChange = handler;
  }

  /**
   * Validate and install a plugin.
   *
   * @throws {Error} If name is invalid, duplicate, or missing dependencies.
   */
  async register(plugin: TrackFlowPlugin): Promise<void> {
    this.validatePlugin(plugin);

    const collectors: PluginCollector[] = [];
    const processors: Array<(event: TrackerEvent) => TrackerEvent | null> = [];
    const listeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

    const context: PluginContext = {
      eventBus: this.eventBus,
      config: this.config,
      logger: this.logger,

      on: (event: string, handler: (...args: unknown[]) => void): void => {
        listeners.push({ event, handler });
        this.eventBus.on(event, handler);
      },

      addProcessor: (processor: (event: TrackerEvent) => TrackerEvent | null): void => {
        processors.push(processor);
      },

      addCollector: (collector: PluginCollector): void => {
        collectors.push(collector);
        try {
          const res = collector.start();
          if (res instanceof Promise) {
            void res.catch((err) => {
              this.logger.error(`Collector in plugin "${plugin.name}" failed to start:`, err);
            });
          }
        } catch (err) {
          this.logger.error(`Collector in plugin "${plugin.name}" threw on start:`, err);
        }
      },

      setStorageAdapter: (adapter: StorageAdapter): void => {
        if (this.onStorageAdapterChange) {
          this.onStorageAdapterChange(adapter);
        }
      },

      getPlugin: (name: string): TrackFlowPlugin | undefined => {
        return this.getPlugin(name);
      },
    };

    try {
      await plugin.install(context);
    } catch (error: unknown) {
      this.logger.error(
        `Plugin "${plugin.name}" threw during install: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.eventBus.emit('plugin:error', { plugin: plugin.name, error, hook: 'install' });
      return;
    }

    this.records.set(plugin.name, {
      plugin,
      context,
      processors,
      collectors,
      listeners,
    });

    this.logger.debug(`Plugin "${plugin.name}" registered successfully.`);
  }

  /**
   * Uninstall and remove a plugin by name, releasing all registered resources.
   */
  async unregister(name: string): Promise<void> {
    const record = this.records.get(name);
    if (!record) {
      this.logger.warn(`Cannot unregister unknown plugin "${name}".`);
      return;
    }

    // 1. Run uninstall hook safely
    if (record.plugin.uninstall) {
      try {
        await record.plugin.uninstall(record.context);
      } catch (error: unknown) {
        this.logger.error(
          `Plugin "${name}" threw during uninstall: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        this.eventBus.emit('plugin:error', { plugin: name, error, hook: 'uninstall' });
      }
    }

    // 2. Stop collectors
    for (const collector of record.collectors) {
      try {
        const res = collector.stop();
        if (res instanceof Promise) {
          await res;
        }
      } catch (colErr) {
        this.logger.error(`Error stopping collector for plugin "${name}":`, colErr);
      }
    }

    // 3. Unbind event listeners
    for (const { event, handler } of record.listeners) {
      this.eventBus.off(event, handler);
    }

    this.records.delete(name);
    this.logger.debug(`Plugin "${name}" unregistered and cleaned up.`);
  }

  /** Retrieve a registered plugin by name. */
  getPlugin(name: string): TrackFlowPlugin | undefined {
    return this.records.get(name)?.plugin;
  }

  /** Return all registered plugins. */
  getPlugins(): TrackFlowPlugin[] {
    return Array.from(this.records.values()).map((r) => r.plugin);
  }

  /** Check whether a plugin with the given name is registered. */
  hasPlugin(name: string): boolean {
    return this.records.has(name);
  }

  /** Return all active processors registered by plugins. */
  getProcessors(): Array<(event: TrackerEvent) => TrackerEvent | null> {
    const all: Array<(event: TrackerEvent) => TrackerEvent | null> = [];
    for (const rec of this.records.values()) {
      all.push(...rec.processors);
    }
    return all;
  }

  /**
   * Run all `beforeProcess` plugin hooks on an event.
   * If any hook returns `null`, the event is dropped.
   */
  runBeforeProcess(event: TrackerEvent): TrackerEvent | null {
    let current: TrackerEvent | null = event;

    for (const rec of this.records.values()) {
      if (rec.plugin.beforeProcess && current) {
        try {
          current = rec.plugin.beforeProcess(current);
          if (current === null) return null;
        } catch (err) {
          this.logger.error(`Plugin "${rec.plugin.name}" threw in beforeProcess:`, err);
          this.executeOnError(err, 'beforeProcess');
        }
      }
    }

    return current;
  }

  /**
   * Run all `afterProcess` plugin hooks safely.
   */
  runAfterProcess(event: TrackerEvent): void {
    for (const rec of this.records.values()) {
      if (rec.plugin.afterProcess) {
        try {
          rec.plugin.afterProcess(event);
        } catch (err) {
          this.logger.error(`Plugin "${rec.plugin.name}" threw in afterProcess:`, err);
          this.executeOnError(err, 'afterProcess');
        }
      }
    }
  }

  /**
   * Run all `beforeFlush` plugin hooks safely.
   */
  runBeforeFlush(events: TrackerEvent[]): TrackerEvent[] {
    let current = events;

    for (const rec of this.records.values()) {
      if (rec.plugin.beforeFlush) {
        try {
          current = rec.plugin.beforeFlush(current);
        } catch (err) {
          this.logger.error(`Plugin "${rec.plugin.name}" threw in beforeFlush:`, err);
          this.executeOnError(err, 'beforeFlush');
        }
      }
    }

    return current;
  }

  /**
   * Notify plugins of an error occurring in the tracker.
   */
  executeOnError(error: unknown, stage: string): void {
    for (const rec of this.records.values()) {
      if (rec.plugin.onError) {
        try {
          rec.plugin.onError(error, stage);
        } catch (err) {
          this.logger.error(`Plugin "${rec.plugin.name}" threw in onError:`, err);
        }
      }
    }
  }

  /**
   * Notify plugins of a new event creation.
   */
  executeOnEvent(event: TrackerEvent): void {
    for (const rec of this.records.values()) {
      if (rec.plugin.onEvent) {
        try {
          rec.plugin.onEvent(event);
        } catch (err) {
          this.logger.error(`Plugin "${rec.plugin.name}" threw in onEvent:`, err);
        }
      }
    }
  }

  private validatePlugin(plugin: TrackFlowPlugin): void {
    if (!plugin.name || plugin.name.trim().length === 0) {
      throw new Error('Plugin name must be a non-empty string.');
    }

    if (this.records.has(plugin.name)) {
      throw new Error(`A plugin named "${plugin.name}" is already registered.`);
    }

    if (plugin.dependencies && plugin.dependencies.length > 0) {
      for (const dep of plugin.dependencies) {
        if (!this.records.has(dep)) {
          throw new Error(
            `Plugin "${plugin.name}" requires dependency "${dep}" to be registered first.`,
          );
        }
      }
    }
  }
}
