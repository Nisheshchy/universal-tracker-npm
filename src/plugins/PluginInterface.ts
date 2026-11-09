import type { EventBus } from '../core/EventBus.js';
import type { Logger } from '../core/Logger.js';
import type { TrackerConfig, TrackerEvent, StorageAdapter } from '../types/index.js';

export interface PluginCollector {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
}

/**
 * Context object supplied to every plugin during installation.
 *
 * Provides controlled access to TrackFlow internals so that plugins can
 * subscribe to lifecycle events, inject processors, collectors, and storage.
 */
export interface PluginContext {
  /** The global event bus for publishing / subscribing to internal events. */
  readonly eventBus: EventBus;

  /** The active tracker configuration (read-only snapshot). */
  readonly config: TrackerConfig;

  /** Scoped logger instance for the plugin. */
  readonly logger: Logger;

  /**
   * Subscribe to a named lifecycle / domain event.
   *
   * @param event   - Event name (e.g. `'tracker:start'`, `'event:saved'`).
   * @param handler - Callback invoked when the event fires.
   */
  on(event: string, handler: (...args: unknown[]) => void): void;

  /**
   * Register a synchronous processor that is invoked for every tracked
   * event **before** it is persisted.
   *
   * Returning `null` from the processor drops the event entirely.
   */
  addProcessor(processor: (event: TrackerEvent) => TrackerEvent | null): void;

  /**
   * Register a custom event collector lifecycle managed by the plugin.
   */
  addCollector(collector: PluginCollector): void;

  /**
   * Register a custom storage adapter from the plugin.
   */
  setStorageAdapter?(adapter: StorageAdapter): void;

  /**
   * Look up another installed plugin by name.
   */
  getPlugin(name: string): TrackFlowPlugin | undefined;
}

/**
 * Interface that every TrackFlow plugin implements.
 *
 * Plugins extend the tracker's behaviour without modifying core code.
 * They are installed via the {@link PluginManager} which guarantees
 * error isolation — a misbehaving plugin will never crash the tracker.
 */
export interface TrackFlowPlugin {
  /** Unique human-readable name for the plugin. */
  readonly name: string;

  /** Optional SemVer version string. */
  readonly version?: string;

  /** Optional list of plugin names that must be installed before this one. */
  readonly dependencies?: readonly string[];

  /**
   * Called once when the plugin is registered with the tracker.
   */
  install(context: PluginContext): void | Promise<void>;

  /**
   * Called when the plugin is unregistered.
   */
  uninstall?(context?: PluginContext): void | Promise<void>;

  /**
   * Lifecycle hook invoked before an event is processed.
   * Return modified event or `null` to drop it.
   */
  beforeProcess?(event: TrackerEvent): TrackerEvent | null;

  /**
   * Lifecycle hook invoked after an event is successfully stored.
   */
  afterProcess?(event: TrackerEvent): void;

  /**
   * Lifecycle hook invoked before a batch is flushed.
   */
  beforeFlush?(events: TrackerEvent[]): TrackerEvent[];

  /**
   * Hook invoked whenever an error occurs in the tracking pipeline.
   */
  onError?(error: unknown, stage: string): void;

  /**
   * Hook invoked on any newly created event.
   */
  onEvent?(event: TrackerEvent): void;
}
