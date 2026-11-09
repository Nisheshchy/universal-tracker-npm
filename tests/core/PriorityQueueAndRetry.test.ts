import { describe, it, expect, vi } from 'vitest';
import { EventQueue, QueueOverflowError } from '../../src/core/EventQueue.js';
import { EventProcessor } from '../../src/core/EventProcessor.js';
import { Logger } from '../../src/core/Logger.js';
import { EventBus } from '../../src/core/EventBus.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import { OfflineBuffer } from '../../src/core/OfflineBuffer.js';
import type { TrackerEvent } from '../../src/types/index.js';

function makeEvent(id: string, priority?: TrackerEvent['priority']): TrackerEvent {
  return {
    id,
    type: 'activity',
    timestamp: new Date().toISOString(),
    appName: 'queue-test',
    environment: 'test',
    priority,
    data: { test: true },
  };
}

describe('Priority Queue, Backpressure & Retry Mechanisms', () => {
  it('should prioritize critical events over normal events in the queue', async () => {
    const logger = new Logger('silent');
    const storage = new MemoryStorage();
    const eventBus = new EventBus();
    const processor = new EventProcessor(
      {
        appName: 'test',
        environment: 'test',
        tracking: { changes: true, activities: true, performance: true, errors: true },
      },
      storage,
      logger,
      eventBus,
    );

    const queue = new EventQueue(
      { maxSize: 10, dropPolicy: 'oldest' },
      processor,
      logger,
    );

    queue.enqueue(makeEvent('low-1', 'low'));
    queue.enqueue(makeEvent('norm-1', 'normal'));
    queue.enqueue(makeEvent('crit-1', 'critical'));

    // Critical event should be inserted at the front
    expect(queue.size()).toBe(3);

    const processedIds: string[] = [];
    processor.addProcessor((ev) => {
      processedIds.push(ev.id);
      return ev;
    });

    await queue.flush();
    expect(processedIds[0]).toBe('crit-1');
  });

  it('should throw QueueOverflowError when dropPolicy is reject and capacity is exceeded', () => {
    const logger = new Logger('silent');
    const processor = new EventProcessor(
      {
        appName: 'test',
        environment: 'test',
        tracking: { changes: true, activities: true, performance: true, errors: true },
      },
      null,
      logger,
      new EventBus(),
    );

    const queue = new EventQueue(
      { maxSize: 2, dropPolicy: 'reject' },
      processor,
      logger,
    );

    queue.enqueue(makeEvent('ev-1'));
    queue.enqueue(makeEvent('ev-2'));

    expect(() => queue.enqueue(makeEvent('ev-3'))).toThrow(QueueOverflowError);
  });

  it('should retry failed batches with exponential backoff and route to offlineBuffer upon exhaustion', async () => {
    const logger = new Logger('silent');
    const failingStorage = {
      initialize: vi.fn(),
      save: vi.fn().mockRejectedValue(new Error('Persistent Database Outage')),
      saveMany: vi.fn().mockRejectedValue(new Error('Persistent Database Outage')),
      query: vi.fn().mockResolvedValue([]),
      flush: vi.fn(),
      close: vi.fn(),
    };

    const processor = new EventProcessor(
      {
        appName: 'test',
        environment: 'test',
        tracking: { changes: true, activities: true, performance: true, errors: true },
      },
      failingStorage,
      logger,
      new EventBus(),
    );

    const offlineBuffer = new OfflineBuffer(logger);
    const queue = new EventQueue(
      {
        maxSize: 10,
        dropPolicy: 'oldest',
        maxRetries: 2,
        retryBaseDelayMs: 5,
        retryMaxDelayMs: 20,
      },
      processor,
      logger,
      offlineBuffer,
    );

    queue.enqueue(makeEvent('fail-1'));
    queue.enqueue(makeEvent('fail-2'));

    await queue.flush();

    // Verify retries took place: (1 initial + 2 retries = 3 calls)
    expect(failingStorage.save).toHaveBeenCalledTimes(3);

    // After exhausting retries, events should be safely moved into offlineBuffer
    expect(offlineBuffer.size()).toBe(2);

    const metrics = queue.getMetrics();
    expect(metrics.flushErrors).toBeGreaterThanOrEqual(1);
  });
});

