import type { UniversalTracker } from '../engines/universal/UniversalTracker.js';
import type { EventCollector } from './EventCollector.js';
import { generateId } from '../utils/generateId.js';
import { isoTimestamp } from '../utils/time.js';

export interface SystemMetrics {
  readonly memory: {
    readonly rss: number;
    readonly heapTotal: number;
    readonly heapUsed: number;
    readonly external: number;
  };
  readonly cpu: {
    readonly user: number;
    readonly system: number;
    readonly percentCPU?: number;
  };
  readonly uptime: number;
  readonly eventLoopDelayMs?: number;
}

export class SystemCollector implements EventCollector {
  readonly name = 'SystemCollector';
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly tracker: UniversalTracker;
  private lastCpuUsage?: { user: number; system: number };
  private lastCpuTime?: number;
  private loopHistogram?: {
    enable: () => void;
    disable: () => void;
    mean: number;
    reset: () => void;
  };

  constructor(tracker: UniversalTracker) {
    this.tracker = tracker;
    this.initEventLoopMonitor();
  }

  private initEventLoopMonitor(): void {
    if (typeof process === 'undefined' || !process.versions?.node) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const perfHooks = require('perf_hooks');
      if (typeof perfHooks.monitorEventLoopDelay === 'function') {
        this.loopHistogram = perfHooks.monitorEventLoopDelay({ resolution: 20 });
      }
    } catch {
      // Event loop monitoring unavailable, continue gracefully
    }
  }

  start(intervalMs: number = 30_000): void {
    if (this.running) return;
    if (typeof process === 'undefined' || !process.versions?.node) {
      this.tracker.logger.warn('SystemCollector is only supported in Node.js environments');
      return;
    }

    this.running = true;
    this.loopHistogram?.enable();
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = Date.now();

    this.timer = setInterval(() => {
      void this.collect();
    }, intervalMs);

    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this.running) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.loopHistogram?.disable();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  collect(): void {
    if (typeof process === 'undefined' || !process.versions?.node) return;

    const mem = process.memoryUsage();
    const currentCpu = process.cpuUsage(this.lastCpuUsage);
    const now = Date.now();
    const elapsedMs = this.lastCpuTime ? now - this.lastCpuTime : 1000;

    let percentCPU = 0;
    if (elapsedMs > 0) {
      const totalCpuMicros = currentCpu.user + currentCpu.system;
      percentCPU = Math.round((totalCpuMicros / (elapsedMs * 1000)) * 100 * 100) / 100;
    }

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;

    let loopDelayMs = 0;
    if (this.loopHistogram) {
      loopDelayMs = Math.round((this.loopHistogram.mean / 1_000_000) * 100) / 100;
      this.loopHistogram.reset();
    }

    const metrics: SystemMetrics = {
      memory: {
        rss: Math.round(mem.rss / (1024 * 1024)),
        heapTotal: Math.round(mem.heapTotal / (1024 * 1024)),
        heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
        external: Math.round(mem.external / (1024 * 1024)),
      },
      cpu: {
        user: currentCpu.user,
        system: currentCpu.system,
        percentCPU,
      },
      uptime: Math.round(process.uptime()),
      eventLoopDelayMs: loopDelayMs,
    };

    const event = {
      id: generateId(),
      type: 'performance' as const,
      timestamp: isoTimestamp(),
      appName: this.tracker.config.appName,
      environment: this.tracker.config.environment,
      source: 'SystemCollector',
      data: {
        operation: 'system.metrics',
        duration: loopDelayMs,
        metrics: {
          'memory.rssMb': metrics.memory.rss,
          'memory.heapTotalMb': metrics.memory.heapTotal,
          'memory.heapUsedMb': metrics.memory.heapUsed,
          'cpu.percent': metrics.cpu.percentCPU ?? 0,
          'eventLoop.delayMs': loopDelayMs,
          'process.uptimeSec': metrics.uptime,
        },
      },
    };

    this.tracker.eventBus.emit('event:created', event);
  }
}

