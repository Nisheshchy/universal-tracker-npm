import type { UniversalTracker } from '../../engines/universal/UniversalTracker.js';

export interface BrowserCollectorOptions {
  readonly captureErrors?: boolean;
  readonly captureUnhandledRejections?: boolean;
  readonly capturePagePerformance?: boolean;
}

export class BrowserCollector {
  private readonly tracker: UniversalTracker;
  private readonly options: BrowserCollectorOptions;
  private errorHandler?: (event: ErrorEvent) => void;
  private rejectionHandler?: (event: PromiseRejectionEvent) => void;
  private installed = false;

  constructor(tracker: UniversalTracker, options?: BrowserCollectorOptions) {
    this.tracker = tracker;
    this.options = {
      captureErrors: options?.captureErrors ?? true,
      captureUnhandledRejections: options?.captureUnhandledRejections ?? true,
      capturePagePerformance: options?.capturePagePerformance ?? true,
    };
  }

  /**
   * Install browser global error and performance collectors.
   */
  install(): void {
    if (this.installed) return;
    if (typeof window === 'undefined') {
      this.tracker.logger.warn('BrowserCollector requires a browser environment (window is undefined)');
      return;
    }

    this.installed = true;

    // 1. Runtime window errors
    if (this.options.captureErrors) {
      this.errorHandler = (event: ErrorEvent) => {
        const error = event.error || new Error(event.message);
        this.tracker.errors.capture(error, {
          source: 'window.onerror',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        });
      };
      window.addEventListener('error', this.errorHandler);
    }

    // 2. Unhandled promise rejections
    if (this.options.captureUnhandledRejections) {
      this.rejectionHandler = (event: PromiseRejectionEvent) => {
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));
        this.tracker.errors.capture(error, {
          source: 'window.unhandledrejection',
        });
      };
      window.addEventListener('unhandledrejection', this.rejectionHandler);
    }

    // 3. Navigation / Page Load performance metrics
    if (this.options.capturePagePerformance) {
      this.captureNavigationMetrics();
    }

    this.tracker.logger.info('BrowserCollector installed');
  }

  /**
   * Capture browser navigation timing metrics safely.
   */
  private captureNavigationMetrics(): void {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;

    const recordMetrics = () => {
      try {
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries.length > 0) {
          const nav = navEntries[0] as PerformanceNavigationTiming;
          const loadTime = nav.loadEventEnd - nav.startTime;
          const dnsTime = nav.domainLookupEnd - nav.domainLookupStart;
          const tcpTime = nav.connectEnd - nav.connectStart;
          const ttfb = nav.responseStart - nav.requestStart;
          const domInteractive = nav.domInteractive - nav.startTime;

          this.tracker.performance.record(
            'page.load',
            Math.max(0, loadTime),
            {
              dnsTime: Math.max(0, dnsTime),
              tcpTime: Math.max(0, tcpTime),
              ttfb: Math.max(0, ttfb),
              domInteractive: Math.max(0, domInteractive),
            },
            { url: window.location.href },
          );
        }
      } catch {
        // Fallback or ignore if not supported
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(recordMetrics, 0);
    } else {
      window.addEventListener('load', () => setTimeout(recordMetrics, 0), { once: true });
    }
  }

  /**
   * Uninstall browser event listeners.
   */
  uninstall(): void {
    if (!this.installed || typeof window === 'undefined') return;

    if (this.errorHandler) {
      window.removeEventListener('error', this.errorHandler);
      this.errorHandler = undefined;
    }

    if (this.rejectionHandler) {
      window.removeEventListener('unhandledrejection', this.rejectionHandler);
      this.rejectionHandler = undefined;
    }

    this.installed = false;
    this.tracker.logger.info('BrowserCollector uninstalled');
  }
}

