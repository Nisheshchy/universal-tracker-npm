import type { EventBus } from '../core/EventBus.js';
import type { Logger } from '../core/Logger.js';
import type { TrackerConfig, TrackerEvent } from '../types/index.js';

/**
 * Context object supplied to every plugin during installation.
 *
 * Provides controlled access to TrackFlow internals so that plugins can
 * subscribe to lifecycle events and inject custom event processors.
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
   * Returning `null` from the processor drops the event entirely,
   * allowing plugins to implement filtering / sampling logic.
   *
   * @param processor - A function that receives a {@link TrackerEvent}
   *                    and returns a (possibly mutated) event or `null`.
   */
  addProcessor(processor: (event: TrackerEvent) => TrackerEvent | null): void;
}

/**
 * Interface that every TrackFlow plugin must implement.
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

  /**
   * Called once when the plugin is registered with the tracker.
   *
   * Use this hook to subscribe to events, register processors, or
   * perform any async setup (e.g. opening a network connection).
   */
  install(context: PluginContext): void | Promise<void>;

  /**
   * Called when the plugin is unregistered.
   *
   * Use this hook to clean up resources, remove listeners, etc.
   */
  uninstall?(): void | Promise<void>;
}
