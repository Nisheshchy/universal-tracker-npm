import { describe, it, expect, vi } from 'vitest';
import { createTracker } from '../../src/index.js';
import { trackflowMiddleware } from '../../src/express.js';
import { BrowserCollector } from '../../src/browser.js';

describe('Integration: Export System & Express Exclusions', () => {
  it('should export events filtered by type, date range, and user ID', async () => {
    const tracker = createTracker({ appName: 'export-filter-test' });
    await tracker.start();

    // 1. User A activity
    tracker.activities.track('action.view', { userId: 'user_A' });
    // 2. User B activity
    tracker.activities.track('action.buy', { userId: 'user_B' });
    // 3. Performance metric
    tracker.performance.record('calc', 10);
    // 4. Error
    tracker.errors.captureMessage('Test failure');

    await tracker.flush();

    // Export only user_A
    const userAExport = await tracker.export({ userId: 'user_A' });
    const parsedUserA = JSON.parse(userAExport);
    expect(parsedUserA).toHaveLength(1);
    expect(parsedUserA[0].userId).toBe('user_A');

    // Export only errors
    const errorExport = await tracker.export({ type: 'error' });
    const parsedErrors = JSON.parse(errorExport);
    expect(parsedErrors).toHaveLength(1);
    expect(parsedErrors[0].type).toBe('error');

    // Export with envelope metadata
    const metadataExport = await tracker.export({ includeMetadata: true, limit: 2 });
    const parsedMeta = JSON.parse(metadataExport);
    expect(parsedMeta).toHaveProperty('exportedAt');
    expect(parsedMeta).toHaveProperty('count');
    expect(parsedMeta).toHaveProperty('events');

    await tracker.stop();
  });

  it('Express middleware should respect route exclusions and redact sensitive headers', () => {
    const tracker = createTracker();
    const middleware = trackflowMiddleware(tracker, {
      excludeRoutes: ['/health', /^\/metrics/],
      captureHeaders: true,
      redactHeaders: ['x-custom-secret'],
    });

    const next1 = vi.fn();
    const excludedReq1: any = {
      path: '/health',
      method: 'GET',
    };
    middleware(excludedReq1, {} as any, next1);
    expect(next1).toHaveBeenCalled();

    const next2 = vi.fn();
    const excludedReq2: any = {
      path: '/metrics/prometheus',
      method: 'GET',
    };
    middleware(excludedReq2, {} as any, next2);
    expect(next2).toHaveBeenCalled();

    // Normal non-excluded route with sensitive headers
    const next3 = vi.fn();
    const trackedReq: any = {
      path: '/api/v1/orders',
      method: 'POST',
      headers: {
        authorization: 'Bearer token123',
        cookie: 'sessionId=abc',
        'x-custom-secret': 'mySecretValue',
        'content-type': 'application/json',
      },
    };
    const res: any = {
      setHeader: vi.fn(),
      on: vi.fn(),
    };

    middleware(trackedReq, res, next3);
    expect(next3).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));

    const timeline = tracker.activities.getTimeline();
    const orderActivity = timeline.find((a) => (a.metadata as any)?.path === '/api/v1/orders');
    expect(orderActivity).toBeDefined();

    const capturedHeaders = (orderActivity?.metadata as any)?.headers;
    expect(capturedHeaders['content-type']).toBe('application/json');
    expect(capturedHeaders['authorization']).toBe('[REDACTED]');
    expect(capturedHeaders['cookie']).toBe('[REDACTED]');
    expect(capturedHeaders['x-custom-secret']).toBe('[REDACTED]');
  });

  it('BrowserCollector should track page lifecycle events with DOM mocks', () => {
    const tracker = createTracker();
    const listeners: Record<string, () => void> = {};

    // Mock global window and document
    const mockWindow = {
      addEventListener: (event: string, cb: () => void) => {
        listeners[event] = cb;
      },
      removeEventListener: vi.fn(),
      location: { href: 'https://example.com/dashboard' },
    };

    const mockDocument = {
      addEventListener: (event: string, cb: () => void) => {
        listeners[event] = cb;
      },
      removeEventListener: vi.fn(),
      visibilityState: 'hidden',
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);

    const collector = new BrowserCollector(tracker, {
      captureErrors: false,
      captureUnhandledRejections: false,
      capturePagePerformance: false,
      capturePageLifecycle: true,
    });

    collector.install();

    // Trigger visibilitychange
    listeners['visibilitychange']?.();
    // Trigger pagehide
    listeners['pagehide']?.();

    collector.uninstall();

    const timeline = tracker.activities.getTimeline();
    const visibilityEvent = timeline.find((a) => a.action === 'page.visibility');
    const hideEvent = timeline.find((a) => a.action === 'page.hide');

    expect(visibilityEvent).toBeDefined();
    expect(visibilityEvent?.metadata?.visibilityState).toBe('hidden');

    expect(hideEvent).toBeDefined();

    vi.unstubAllGlobals();
  });
});
