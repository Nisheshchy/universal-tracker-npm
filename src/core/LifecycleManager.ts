import { EventBus, BUILT_IN_EVENTS } from './EventBus.js';
import { Logger } from './Logger.js';

/** Valid lifecycle states. */
export type LifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/** Async handler invoked during lifecycle transitions. */
export type LifecycleHandler = () => Promise<void>;

/**
 * Manages the tracker lifecycle through well-defined state transitions:
 *
 *   idle → starting → running → stopping → stopped
 *
 * Handlers registered via `onStart` / `onStop` are executed during
 * the corresponding transition. If any handler throws, the manager
 * transitions to the `error` state and re-throws an `AggregateError`.
 */
export class LifecycleManager {
  private state: LifecycleState = 'idle';
  private readonly startHandlers: LifecycleHandler[] = [];
  private readonly stopHandlers: LifecycleHandler[] = [];
  private readonly eventBus: EventBus;
  private readonly logger: Logger;

  constructor(eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus;
    this.logger = logger;
  }

  /** Return the current lifecycle state. */
  getState(): LifecycleState {
    return this.state;
  }

  /**
   * Transition from `idle` → `starting` → `running`.
   *
   * All registered start handlers are executed concurrently.
   * If any handler fails, the state moves to `error` and an
   * `AggregateError` is thrown containing every failure.
   *
   * @throws {Error} If the manager is not in the `idle` state.
   * @throws {AggregateError} If one or more start handlers fail.
   */
  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(
        `LifecycleManager: cannot start — current state is '${this.state}' (expected 'idle')`,
      );
    }

    this.state = 'starting';
    this.logger.info('Lifecycle starting…');

    const errors = await this.executeHandlers(this.startHandlers);

    if (errors.length > 0) {
      this.state = 'error';
      this.logger.error(`Lifecycle start failed with ${errors.length} error(s)`);
      throw new AggregateError(errors, 'LifecycleManager: start failed');
    }

    this.state = 'running';
    this.logger.info('Lifecycle running');
    this.eventBus.emit(BUILT_IN_EVENTS.TRACKER_START);
  }

  /**
   * Transition from `running` → `stopping` → `stopped`.
   *
   * All registered stop handlers are executed concurrently.
   * If any handler fails, the state moves to `error` and an
   * `AggregateError` is thrown containing every failure.
   *
   * @throws {Error} If the manager is not in the `running` state.
   * @throws {AggregateError} If one or more stop handlers fail.
   */
  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error(
        `LifecycleManager: cannot stop — current state is '${this.state}' (expected 'running')`,
      );
    }

    this.state = 'stopping';
    this.logger.info('Lifecycle stopping…');

    const errors = await this.executeHandlers(this.stopHandlers);

    if (errors.length > 0) {
      this.state = 'error';
      this.logger.error(`Lifecycle stop failed with ${errors.length} error(s)`);
      throw new AggregateError(errors, 'LifecycleManager: stop failed');
    }

    this.state = 'stopped';
    this.logger.info('Lifecycle stopped');
    this.eventBus.emit(BUILT_IN_EVENTS.TRACKER_STOP);
  }

  /** Register a handler to run during the `start` transition. */
  onStart(handler: LifecycleHandler): void {
    this.startHandlers.push(handler);
  }

  /** Register a handler to run during the `stop` transition. */
  onStop(handler: LifecycleHandler): void {
    this.stopHandlers.push(handler);
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Execute an array of async handlers concurrently, collecting all
   * errors without short-circuiting on the first failure.
   */
  private async executeHandlers(handlers: LifecycleHandler[]): Promise<unknown[]> {
    const results = await Promise.allSettled(handlers.map((h) => h()));

    return results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason as unknown);
  }
}

