import { describe, it, expect } from 'vitest';
import {
  PerformanceTracker,
  MetricsCollector,
  ThresholdManager,
  EventBus,
  type TrackerEvent,
} from '../../src/index.js';

describe('Performance Tracker Module', () => {
  describe('MetricsCollector', () => {
    it('should aggregate duration statistics correctly', () => {
      const collector = new MetricsCollector();
      collector.record('query', 10);
      collector.record('query', 20);
      collector.record('query', 30);
      collector.record('query', 40);
      collector.record('query', 50);

      const summary = collector.getSummary('query');
      expect(summary).toBeDefined();
      expect(summary?.count).toBe(5);
      expect(summary?.min).toBe(10);
      expect(summary?.max).toBe(50);
      expect(summary?.avg).toBe(30);
      expect(summary?.p95).toBe(50);
      expect(summary?.p99).toBe(50);
    });
  });

  describe('ThresholdManager', () => {
    it('should identify when operation exceeds threshold', () => {
      const tm = new ThresholdManager(100);
      tm.setThreshold('fast-op', 20);

      expect(tm.isExceeded('fast-op', 15).exceeded).toBe(false);
      expect(tm.isExceeded('fast-op', 25).exceeded).toBe(true);

      // Default fallback
      expect(tm.isExceeded('other-op', 80).exceeded).toBe(false);
      expect(tm.isExceeded('other-op', 120).exceeded).toBe(true);
    });
  });

  describe('PerformanceTracker workflow', () => {
    it('should measure async operations and return result', async () => {
      const eventBus = new EventBus();
      const events: TrackerEvent[] = [];
      eventBus.on('event:created', (e) => events.push(e as TrackerEvent));

      const tracker = new PerformanceTracker({ defaultThresholdMs: 50 }, { eventBus });

      const result = await tracker.measure('fetch-data', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { data: 'ok' };
      });

      expect(result).toEqual({ data: 'ok' });
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('performance');

      const data = events[0]?.data as { operation: string; duration: number };
      expect(data.operation).toBe('fetch-data');
      expect(data.duration).toBeGreaterThanOrEqual(8);
    });

    it('should track manual timer', () => {
      const eventBus = new EventBus();
      const events: TrackerEvent[] = [];
      eventBus.on('event:created', (e) => events.push(e as TrackerEvent));

      const tracker = new PerformanceTracker(undefined, { eventBus });
      const timer = tracker.startTimer('task-run');
      const duration = timer.end({ processedItems: 500 });

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(events).toHaveLength(1);
    });

    it('should record errors when measured operation throws', async () => {
      const eventBus = new EventBus();
      const events: TrackerEvent[] = [];
      eventBus.on('event:created', (e) => events.push(e as TrackerEvent));

      const tracker = new PerformanceTracker(undefined, { eventBus });

      await expect(
        tracker.measure('failing-op', () => {
          throw new Error('Database connection failed');
        }),
      ).rejects.toThrow('Database connection failed');

      expect(events).toHaveLength(1);
      const metadata = (events[0]?.data as any)?.metadata;
      expect(metadata?.error).toBe('Database connection failed');
    });
  });
});
