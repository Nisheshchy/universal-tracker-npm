import type { UniversalTracker } from '../../engines/universal/UniversalTracker.js';
import { SystemCollector } from '../../collectors/SystemCollector.js';

export interface NodeCollectorOptions {
  readonly captureUncaughtExceptions?: boolean;
  readonly captureUnhandledRejections?: boolean;
  readonly collectSystemMetrics?: boolean;
  readonly systemMetricsIntervalMs?: number;
  readonly handleGracefulShutdown?: boolean;
}

export class NodeCollector {
  private readonly tracker: UniversalTracker;
  private readonly options: NodeCollectorOptions;
  private systemCollector?: SystemCollector;
  private uncaughtExceptionHandler?: (error: Error) => void;
  private unhandledRejectionHandler?: (reason: unknown) => void;
  private sigintHandler?: () => void;
  private sigtermHandler?: () => void;
  private installed = false;

  constructor(tracker: UniversalTracker, options?: NodeCollectorOptions) {
    this.tracker = tracker;
    this.options = {
      captureUncaughtExceptions: options?.captureUncaughtExceptions ?? true,
      captureUnhandledRejections: options?.captureUnhandledRejections ?? true,
      collectSystemMetrics: options?.collectSystemMetrics ?? true,
      systemMetricsIntervalMs: options?.systemMetricsIntervalMs ?? 30_000,
      handleGracefulShutdown: options?.handleGracefulShutdown ?? true,
    };
  }

  /**
   * Install Node.js runtime collectors and handlers.
   */
  install(): void {
    if (this.installed) return;
    if (typeof process === 'undefined' || !process.versions?.node) {
      this.tracker.logger.warn('NodeCollector can only be installed in a Node.js environment');
      return;
    }

    this.installed = true;

    // 1. Uncaught Exceptions
    if (this.options.captureUncaughtExceptions) {
      this.uncaughtExceptionHandler = (error: Error) => {
        this.tracker.errors.capture(error, { source: 'process.uncaughtException' });
      };
      process.on('uncaughtException', this.uncaughtExceptionHandler);
    }

    // 2. Unhandled Rejections
    if (this.options.captureUnhandledRejections) {
      this.unhandledRejectionHandler = (reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        this.tracker.errors.capture(error, { source: 'process.unhandledRejection' });
      };
      process.on('unhandledRejection', this.unhandledRejectionHandler);
    }

    // 3. System Metrics
    if (this.options.collectSystemMetrics) {
      this.systemCollector = new SystemCollector(this.tracker);
      this.systemCollector.start(this.options.systemMetricsIntervalMs);
    }

    // 4. Graceful Shutdown
    if (this.options.handleGracefulShutdown) {
      const shutdown = async () => {
        this.tracker.logger.info('Received shutdown signal, flushing TrackFlow events...');
        try {
          await this.tracker.stop();
        } catch (err) {
          this.tracker.logger.error('Error during graceful shutdown:', err);
        }
      };

      this.sigintHandler = () => {
        void shutdown();
      };
      this.sigtermHandler = () => {
        void shutdown();
      };

      process.once('SIGINT', this.sigintHandler);
      process.once('SIGTERM', this.sigtermHandler);
    }

    this.tracker.logger.info('NodeCollector installed successfully');
  }

  /**
   * Uninstall all handlers and stop metric collection.
   */
  uninstall(): void {
    if (!this.installed) return;

    if (this.uncaughtExceptionHandler) {
      process.removeListener('uncaughtException', this.uncaughtExceptionHandler);
      this.uncaughtExceptionHandler = undefined;
    }

    if (this.unhandledRejectionHandler) {
      process.removeListener('unhandledRejection', this.unhandledRejectionHandler);
      this.unhandledRejectionHandler = undefined;
    }

    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = undefined;
    }

    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = undefined;
    }

    if (this.systemCollector) {
      this.systemCollector.stop();
      this.systemCollector = undefined;
    }

    this.installed = false;
    this.tracker.logger.info('NodeCollector uninstalled');
  }
}
