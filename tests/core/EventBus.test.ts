import { describe, it, expect, vi } from 'vitest';
import { EventBus, BUILT_IN_EVENTS } from '../../src/core/EventBus.js';

describe('Core: EventBus', () => {
  it('should register and trigger synchronous listeners', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('test:event', handler);
    expect(bus.listenerCount('test:event')).toBe(1);

    bus.emit('test:event', { payload: 42 });
    expect(handler).toHaveBeenCalledWith({ payload: 42 });
  });

  it('should remove listeners with off() and removeAllListeners()', () => {
    const bus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('evt', handler1);
    bus.on('evt', handler2);
    expect(bus.listenerCount('evt')).toBe(2);

    bus.off('evt', handler1);
    expect(bus.listenerCount('evt')).toBe(1);

    bus.emit('evt', 'data');
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith('data');

    bus.removeAllListeners('evt');
    expect(bus.listenerCount('evt')).toBe(0);
  });

  it('should handle async listeners with emitAsync()', async () => {
    const bus = new EventBus();
    const order: number[] = [];

    bus.on(BUILT_IN_EVENTS.TRACKER_START, async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });

    bus.on(BUILT_IN_EVENTS.TRACKER_START, async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(2);
    });

    await bus.emitAsync(BUILT_IN_EVENTS.TRACKER_START);
    expect(order).toContain(1);
    expect(order).toContain(2);
  });

  it('should aggregate errors without aborting other handlers', () => {
    const bus = new EventBus();
    const successfulHandler = vi.fn();

    bus.on('error-test', () => {
      throw new Error('Handler 1 exploded');
    });
    bus.on('error-test', successfulHandler);

    expect(() => bus.emit('error-test')).toThrow(AggregateError);
    expect(successfulHandler).toHaveBeenCalled();
  });
});
