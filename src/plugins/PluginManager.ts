import type { EventBus } from '../core/EventBus.js';
import type { Logger } from '../core/Logger.js';
import type { TrackerConfig, TrackerEvent } from '../types/index.js';
import type { TrackFlowPlugin, PluginContext } from './PluginInterface.js';

/**
 * Manages the full lifecycle of TrackFlow plugins.
 *
 * Responsibilities:
 * - Validate plugins before installation (non-empty name, no duplicates).
 * - Provide each plugin with an isolated {@link PluginContext}.
 * - Aggregate event processors registered by plugins.
 * - Ensure that plugin errors are caught and logged without crashing
 *   the host tracker.
 */
export class PluginManager {
  private readonly plugins: Map<string, TrackFlowPlugin> = new Map();
  private readonly processors: Array<(event: TrackerEvent) => TrackerEvent | null> = [];

  private readonly eventBus: EventBus;
  private readonly config: TrackerConfig;
  private readonly logger: Logger;

  constructor(eventBus: EventBus, config: TrackerConfig, logger: Logger) {
    this.eventBus = eventBus;
    this.config = config;
    this.logger = logger;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Validate and install a plugin.
   *
   * @throws {Error} If the plugin name is empty or a plugin with the same
   *                 name is already registered.
   */
  async register(plugin: TrackFlowPlugin): Promise<void> {
    this.validatePlugin(plugin);

    const context = this.createContext(plugin);

    try {
      await plugin.install(context);
    } catch (error: unknown) {
      this.logger.error(
        `Plugin "${plugin.name}" threw during install: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Do not store a plugin that failed to install.
      return;
    }

    this.plugins.set(plugin.name, plugin);
    this.logger.debug(`Plugin "${plugin.name}" registered successfully.`);
  }

  /**
   * Uninstall and remove a plugin by name.
   *
   * If the plugin defines an `uninstall` hook it is called first; errors
   * during uninstall are logged but do not prevent removal.
   */
  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      this.logger.warn(`Cannot unregister unknown plugin "${name}".`);
      return;
    }

    if (plugin.uninstall) {
      try {
        await plugin.uninstall();
      } catch (error: unknown) {
        this.logger.error(
          `Plugin "${name}" threw during uninstall: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.plugins.delete(name);
    this.logger.debug(`Plugin "${name}" unregistered.`);
  }

  /** Retrieve a registered plugin by name, or `undefined`. */
  getPlugin(name: string): TrackFlowPlugin | undefined {
    return this.plugins.get(name);
  }

  /** Return all registered plugins (insertion order). */
  getPlugins(): TrackFlowPlugin[] {
    return [...this.plugins.values()];
  }

  /** Check whether a plugin with the given name is registered. */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Return the ordered list of event processors contributed by plugins.
   *
   * The tracker core should pipe every outgoing event through these
   * processors before persisting it.
   */
  getProcessors(): Array<(event: TrackerEvent) => TrackerEvent | null> {
    return [...this.processors];
  }

  /* ------------------------------------------------------------------ */
  /*  Internal helpers                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Validate basic invariants before a plugin is installed.
   *
   * @throws {Error} On invalid or duplicate plugin.
   */
  private validatePlugin(plugin: TrackFlowPlugin): void {
    if (!plugin.name || plugin.name.trim().length === 0) {
      throw new Error('Plugin name must be a non-empty string.');
    }

    if (this.plugins.has(plugin.name)) {
      throw new Error(
        `A plugin named "${plugin.name}" is already registered.`,
      );
    }
  }

  /**
   * Build the {@link PluginContext} that is handed to the plugin during
   * installation.
   */
  private createContext(_plugin: TrackFlowPlugin): PluginContext {
    return {
      eventBus: this.eventBus,
      config: this.config,
      logger: this.logger,

      on: (event: string, handler: (...args: unknown[]) => void): void => {
        this.eventBus.on(event, handler);
      },

      addProcessor: (
        processor: (event: TrackerEvent) => TrackerEvent | null,
      ): void => {
        this.processors.push(processor);
      },
    };
  }
}
