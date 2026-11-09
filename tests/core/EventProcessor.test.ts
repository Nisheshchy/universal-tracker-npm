import { describe, it, expect, vi } from 'vitest';
import { EventProcessor } from '../../src/core/EventProcessor.js';
import { EventBus, BUILT_IN_EVENTS } from '../../src/core/EventBus.js';
import { Logger } from '../../src/core/Logger.js';
import { createConfig } from '../../src/core/Config.js';
import type { TrackerEvent, StorageAdapter } from '../../src/types/index.js';

describe('Core: EventProcessor', () => {
  const sampleEvent: TrackerEvent = {
    id: 'e-100',
    type: 'activity',
    timestamp: '2026-01-01T00:00:00.000Z',
    appName: 'unit-test',
    environment: 'test',
    data: {
      action: 'login',
      password: 'secretPassword123',
      safeField: 'hello',
    },
  };

  it('should validate and reject malformed events', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const processor = new EventProcessor(createConfig({}), null, logger, bus);

    const errorSpy = vi.fn();
    bus.on(BUILT_IN_EVENTS.EVENT_ERROR, errorSpy);

    const invalidEvent = { ...sampleEvent, id: '' };
    await processor.process(invalidEvent);

    expect(errorSpy).toHaveBeenCalled();
  });

  it('should filter events when tracking is disabled for that type', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const config = createConfig({
      tracking: {
        changes: true,
        activities: false, // disabled!
        performance: true,
        errors: true,
      },
    });

    const mockStorage: StorageAdapter = {
      initialize: vi.fn(),
      save: vi.fn(),
      saveMany: vi.fn(),
      query: vi.fn(),
      flush: vi.fn(),
      close: vi.fn(),
    };

    const processor = new EventProcessor(config, mockStorage, logger, bus);
    await processor.process(sampleEvent);

    expect(mockStorage.save).not.toHaveBeenCalled();
  });

  it('should redact sensitive fields and save to storage', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const config = createConfig({
      redaction: {
        enabled: true,
        fields: ['password'],
        patterns: [],
        replacement: '[REDACTED]',
      },
    });

    let savedEvent: TrackerEvent | undefined;
    const mockStorage: StorageAdapter = {
      initialize: vi.fn(),
      save: vi.fn(async (evt) => {
        savedEvent = evt;
      }),
      saveMany: vi.fn(),
      query: vi.fn(),
      flush: vi.fn(),
      close: vi.fn(),
    };

    const processor = new EventProcessor(config, mockStorage, logger, bus);
    await processor.process(sampleEvent);

    expect(mockStorage.save).toHaveBeenCalled();
    const savedData = savedEvent?.data as Record<string, unknown>;
    expect(savedData.safeField).toBe('hello');
    expect(savedData.password).toBe('[REDACTED]');
  });

  it('should run custom pipeline processors', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const config = createConfig({});
    let storedEvent: TrackerEvent | undefined;

    const mockStorage: StorageAdapter = {
      initialize: vi.fn(),
      save: vi.fn(async (e) => {
        storedEvent = e;
      }),
      saveMany: vi.fn(),
      query: vi.fn(),
      flush: vi.fn(),
      close: vi.fn(),
    };

    const processor = new EventProcessor(config, mockStorage, logger, bus);
    processor.addProcessor((evt) => ({
      ...evt,
      source: 'custom-processor-injected',
    }));

    await processor.process(sampleEvent);
    expect(storedEvent?.source).toBe('custom-processor-injected');
  });
});

