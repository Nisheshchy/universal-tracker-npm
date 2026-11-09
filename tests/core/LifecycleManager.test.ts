import { describe, it, expect, vi } from 'vitest';
import { LifecycleManager } from '../../src/core/LifecycleManager.js';
import { EventBus, BUILT_IN_EVENTS } from '../../src/core/EventBus.js';
import { Logger } from '../../src/core/Logger.js';

describe('Core: LifecycleManager', () => {
  it('should transition idle -> starting -> running -> stopping -> stopped', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const lifecycle = new LifecycleManager(bus, logger);

    const startSpy = vi.fn();
    const stopSpy = vi.fn();
    bus.on(BUILT_IN_EVENTS.TRACKER_START, startSpy);
    bus.on(BUILT_IN_EVENTS.TRACKER_STOP, stopSpy);

    expect(lifecycle.getState()).toBe('idle');

    await lifecycle.start();
    expect(lifecycle.getState()).toBe('running');
    expect(startSpy).toHaveBeenCalled();

    await lifecycle.stop();
    expect(lifecycle.getState()).toBe('stopped');
    expect(stopSpy).toHaveBeenCalled();
  });

  it('should prevent double-start and double-stop', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const lifecycle = new LifecycleManager(bus, logger);

    await lifecycle.start();
    // Double start should reject
    await expect(lifecycle.start()).rejects.toThrow('cannot start');
    expect(lifecycle.getState()).toBe('running');

    await lifecycle.stop();
    // Double stop should reject
    await expect(lifecycle.stop()).rejects.toThrow('cannot stop');
    expect(lifecycle.getState()).toBe('stopped');
  });

  it('should execute registered onStart and onStop hooks', async () => {
    const bus = new EventBus();
    const logger = new Logger('silent');
    const lifecycle = new LifecycleManager(bus, logger);

    const startHook = vi.fn(async () => {});
    const stopHook = vi.fn(async () => {});

    lifecycle.onStart(startHook);
    lifecycle.onStop(stopHook);

    await lifecycle.start();
    expect(startHook).toHaveBeenCalled();

    await lifecycle.stop();
    expect(stopHook).toHaveBeenCalled();
  });
});
