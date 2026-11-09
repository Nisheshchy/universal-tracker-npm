import { describe, it, expect, vi } from 'vitest';
import { OfflineBuffer } from '../../src/core/OfflineBuffer.js';
import { Logger } from '../../src/core/Logger.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import type { TrackerEvent } from '../../src/types/index.js';

function makeEvent(id: string): TrackerEvent {
  return {
    id,
    type: 'activity',
    timestamp: new Date().toISOString(),
    appName: 'buffer-test',
    environment: 'test',
    data: { action: 'click' },
  };
}

describe('Offline Event Buffering & Dead-Letter Recovery', () => {
  it('should enforce bounded capacity and track dropped events as dead letters', () => {
    const logger = new Logger('silent');
    const buffer = new OfflineBuffer(logger, { maxCapacity: 3 });

    buffer.push(makeEvent('ev-1'));
    buffer.push(makeEvent('ev-2'));
    buffer.push(makeEvent('ev-3'));
    expect(buffer.size()).toBe(3);
    expect(buffer.getDeadLetters()).toBe(0);

    // Push 4th event, exceeding maxCapacity
    buffer.push(makeEvent('ev-4'));
    expect(buffer.size()).toBe(3);
    expect(buffer.getDeadLetters()).toBe(1);
  });

  it('should drain buffered events in FIFO order to storage upon recovery', async () => {
    const logger = new Logger('silent');
    const buffer = new OfflineBuffer(logger);
    const storage = new MemoryStorage();
    await storage.initialize();

    buffer.push(makeEvent('fifo-1'));
    buffer.push(makeEvent('fifo-2'));
    buffer.push(makeEvent('fifo-3'));

    expect(buffer.size()).toBe(3);

    const saved = await buffer.drain(storage);
    expect(saved).toBe(3);
    expect(buffer.size()).toBe(0);

    const queried = await storage.query();
    expect(queried.map((e) => e.id)).toEqual(['fifo-1', 'fifo-2', 'fifo-3']);
  });

  it('should eliminate poison-pill events that exceed maxRetriesPerEvent', async () => {
    const logger = new Logger('silent');
    const buffer = new OfflineBuffer(logger, { maxRetriesPerEvent: 2 });

    const brokenStorage = {
      initialize: vi.fn(),
      save: vi.fn().mockRejectedValue(new Error('Corrupt payload')),
      saveMany: vi.fn().mockRejectedValue(new Error('Corrupt payload')),
      query: vi.fn().mockResolvedValue([]),
      flush: vi.fn(),
      close: vi.fn(),
    };

    buffer.push(makeEvent('bad-event'));

    // Attempt 1: fails, stays in buffer with retryCount = 1
    await buffer.drain(brokenStorage);
    expect(buffer.size()).toBe(1);
    expect(buffer.getDeadLetters()).toBe(0);

    // Attempt 2: fails, reaches maxRetriesPerEvent (2), drops from buffer to dead letters
    await buffer.drain(brokenStorage);
    expect(buffer.size()).toBe(0);
    expect(buffer.getDeadLetters()).toBe(1);
  });
});

