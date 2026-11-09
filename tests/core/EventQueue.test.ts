import { describe, it, expect, vi } from 'vitest';
import { EventQueue } from '../../src/core/EventQueue.js';
import { EventProcessor } from '../../src/core/EventProcessor.js';
import { Logger } from '../../src/core/Logger.js';
import { createConfig } from '../../src/core/Config.js';
import { EventBus } from '../../src/core/EventBus.js';
import type { TrackerEvent } from '../../src/types/index.js';

describe('Core: EventQueue', () => {
  const createMockEvent = (id: string): TrackerEvent => ({
    id,
    type: 'activity',
    timestamp: new Date().toISOString(),
    appName: 'queue-test',
    environment: 'test',
    data: { id },
  });

  it('should enqueue and flush batches to the processor', async () => {
    const logger = new Logger('silent');
    const bus = new EventBus();
    const processor = new EventProcessor(createConfig({}), null, logger, bus);
    const processedBatches: TrackerEvent[][] = [];

    vi.spyOn(processor, 'processBatch').mockImplementation(async (batch) => {
      processedBatches.push(batch);
    });

    const queue = new EventQueue({ maxSize: 100, dropPolicy: 'oldest' }, processor, logger);

    queue.enqueue(createMockEvent('1'));
    queue.enqueue(createMockEvent('2'));
    queue.enqueue(createMockEvent('3'));

    expect(queue.size()).toBe(3);

    await queue.flush();

    expect(queue.size()).toBe(0);
    expect(processedBatches.length).toBeGreaterThan(0);
    expect(processedBatches[0]).toHaveLength(3);
  });

  it('should enforce bounded capacity and drop oldest when configured', () => {
    const logger = new Logger('silent');
    const bus = new EventBus();
    const processor = new EventProcessor(createConfig({}), null, logger, bus);

    const queue = new EventQueue({ maxSize: 2, dropPolicy: 'oldest' }, processor, logger);

    queue.enqueue(createMockEvent('first'));
    queue.enqueue(createMockEvent('second'));
    queue.enqueue(createMockEvent('third')); // should evict 'first'

    expect(queue.size()).toBe(2);

    // Private array inspection to check head eviction
    const items = (queue as any).queue as TrackerEvent[];
    expect(items[0]?.id).toBe('second');
    expect(items[1]?.id).toBe('third');
  });

  it('should enforce bounded capacity and reject newest when dropPolicy is newest', () => {
    const logger = new Logger('silent');
    const bus = new EventBus();
    const processor = new EventProcessor(createConfig({}), null, logger, bus);

    const queue = new EventQueue({ maxSize: 2, dropPolicy: 'newest' }, processor, logger);

    queue.enqueue(createMockEvent('first'));
    queue.enqueue(createMockEvent('second'));
    queue.enqueue(createMockEvent('third')); // should be rejected

    expect(queue.size()).toBe(2);
    const items = (queue as any).queue as TrackerEvent[];
    expect(items[0]?.id).toBe('first');
    expect(items[1]?.id).toBe('second');
  });

  it('should handle auto-flush timer lifecycle', async () => {
    const logger = new Logger('silent');
    const bus = new EventBus();
    const processor = new EventProcessor(createConfig({}), null, logger, bus);
    let flushCount = 0;

    vi.spyOn(processor, 'processBatch').mockImplementation(async () => {
      flushCount++;
    });

    const queue = new EventQueue({ maxSize: 10, dropPolicy: 'oldest' }, processor, logger);

    queue.enqueue(createMockEvent('auto-1'));
    queue.startAutoFlush(25);

    await new Promise((r) => setTimeout(r, 60));

    queue.stopAutoFlush();
    expect(flushCount).toBeGreaterThanOrEqual(1);
    expect(queue.size()).toBe(0);
  });
});
