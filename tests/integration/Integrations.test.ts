import { describe, it, expect, vi } from 'vitest';
import {
  createTracker,
  NodeCollector,
  SystemCollector,
} from '../../src/node.js';
import {
  trackflowMiddleware,
  trackflowErrorMiddleware,
} from '../../src/express.js';
import {
  BrowserCollector,
  InteractionCollector,
} from '../../src/browser.js';

describe('Integrations Suite', () => {
  it('should install and uninstall NodeCollector without error', () => {
    const tracker = createTracker();
    const nodeCollector = new NodeCollector(tracker, {
      captureUncaughtExceptions: true,
      captureUnhandledRejections: true,
      collectSystemMetrics: false,
      handleGracefulShutdown: false,
    });

    nodeCollector.install();
    // Second install should be idempotent
    nodeCollector.install();

    nodeCollector.uninstall();
    // Second uninstall should be idempotent
    nodeCollector.uninstall();
  });

  it('should collect system metrics via SystemCollector in Node.js', () => {
    const tracker = createTracker();
    const systemCollector = new SystemCollector(tracker);

    expect(systemCollector.isRunning()).toBe(false);
    systemCollector.start(5000);
    expect(systemCollector.isRunning()).toBe(true);

    // Call collect directly
    systemCollector.collect();

    systemCollector.stop();
    expect(systemCollector.isRunning()).toBe(false);
  });

  it('Express middleware should trace HTTP requests with correlation IDs and performance', () => {
    const tracker = createTracker();
    const middleware = trackflowMiddleware(tracker);

    const req: any = {
      method: 'POST',
      url: '/api/v1/checkout',
      headers: {},
      userId: 'user_456',
    };

    const listeners: Record<string, () => void> = {};
    const res: any = {
      statusCode: 201,
      setHeader: vi.fn(),
      on: (event: string, cb: () => void) => {
        listeners[event] = cb;
      },
    };

    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));

    // Simulate finish event
    listeners['finish']?.();

    const perfSummary = tracker.performance.getSummary('POST /api/v1/checkout');
    expect(perfSummary).toBeDefined();
  });

  it('Express error middleware should capture errors and pass them along to next', () => {
    const tracker = createTracker();
    const errorMiddleware = trackflowErrorMiddleware(tracker);

    const error = new Error('Database deadlocked');
    const req: any = {
      method: 'GET',
      url: '/api/v1/users',
      userId: 'u_1',
    };
    const res: any = {};
    const next = vi.fn();

    errorMiddleware(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);

    const groups = tracker.errors.getGroups();
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0]?.message).toBe('Database deadlocked');
  });

  it('Browser collectors should gracefully handle non-browser environments without throwing', () => {
    const tracker = createTracker();
    const browserCollector = new BrowserCollector(tracker);
    const interactionCollector = new InteractionCollector(tracker);

    // In Node (no window/document), install and uninstall should warn but not throw
    expect(() => browserCollector.install()).not.toThrow();
    expect(() => browserCollector.uninstall()).not.toThrow();

    expect(() => interactionCollector.install()).not.toThrow();
    expect(() => interactionCollector.uninstall()).not.toThrow();
  });
});
