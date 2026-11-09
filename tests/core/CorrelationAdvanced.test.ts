import { describe, it, expect, beforeEach } from 'vitest';
import {
  CorrelationManager,
  parseTraceparent,
  formatTraceparent,
  generateTraceId,
  generateSpanId,
} from '../../src/core/CorrelationManager.js';
import { createTracker } from '../../src/engines/universal/UniversalTracker.js';

describe('Advanced Correlation & Distributed Tracing', () => {
  let correlation: CorrelationManager;

  beforeEach(() => {
    correlation = new CorrelationManager();
  });

  it('should parse and format valid W3C traceparent headers', () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const parentId = '00f067aa0ba902b7';
    const header = `00-${traceId}-${parentId}-01`;

    const parsed = parseTraceparent(header);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe('00');
    expect(parsed?.traceId).toBe(traceId);
    expect(parsed?.parentId).toBe(parentId);
    expect(parsed?.flags).toBe('01');

    const formatted = formatTraceparent(traceId, parentId, '01');
    expect(formatted).toBe(header);
  });

  it('should reject invalid or zero-filled traceparent headers according to W3C spec', () => {
    expect(parseTraceparent('')).toBeNull();
    expect(parseTraceparent('invalid-string')).toBeNull();
    expect(parseTraceparent('01-abc-def-00')).toBeNull();

    // All-zero trace-id or parent-id is invalid in W3C spec
    const allZeroTrace = '00-00000000000000000000000000000000-00f067aa0ba902b7-01';
    expect(parseTraceparent(allZeroTrace)).toBeNull();

    const allZeroSpan = '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01';
    expect(parseTraceparent(allZeroSpan)).toBeNull();
  });

  it('should create child spans with parentId referencing current spanId', () => {
    correlation.setTraceId('4bf92f3577b34da6a3ce929d0e0e4736');
    correlation.setSpanId('1111222233334444');

    const child = correlation.createChildSpan();
    expect(child.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(child.parentId).toBe('1111222233334444');
    expect(child.spanId).toHaveLength(16);
    expect(child.spanId).not.toBe(child.parentId);
  });

  it('should set context from traceparent header', () => {
    const header = '00-555566667777888899990000aaaabbbb-12345678abcdef01-01';
    const success = correlation.setTraceparent(header);
    expect(success).toBe(true);
    expect(correlation.getTraceId()).toBe('555566667777888899990000aaaabbbb');
    expect(correlation.getParentId()).toBe('12345678abcdef01');
    expect(correlation.getSpanId()).toHaveLength(16);
  });

  it('should propagate correlation context through runWithContext', async () => {
    correlation.setCorrelationId('root-corr');

    await correlation.runWithContext(
      {
        correlationId: 'child-corr-123',
        userId: 'u_async_789',
        metadata: { requestPath: '/api/checkout' },
      },
      async () => {
        expect(correlation.getCorrelationId()).toBe('child-corr-123');
        expect(correlation.getUserId()).toBe('u_async_789');
        expect(correlation.getMetadata()).toEqual({ requestPath: '/api/checkout' });

        // Nested async call
        await correlation.runWithContext(
          {
            correlationId: 'nested-corr-456',
          },
          async () => {
            expect(correlation.getCorrelationId()).toBe('nested-corr-456');
            expect(correlation.getUserId()).toBe('u_async_789'); // inherited
          },
        );

        // Back to child level
        expect(correlation.getCorrelationId()).toBe('child-corr-123');
      },
    );

    // Back to root level
    expect(correlation.getCorrelationId()).toBe('root-corr');
  });

  it('should reconstruct application event timeline from UniversalTracker', async () => {
    const tracker = createTracker({ appName: 'timeline-test' });
    await tracker.start();

    const correlationId = 'flow-order-999';
    tracker.setCorrelationId(correlationId);

    // 1. User login
    tracker.activities.track('user.login', { userId: 'u_order_1' });

    // 2. HTTP Request (simulated span)
    const traceId = generateTraceId();
    const parentSpanId = generateSpanId();
    tracker.correlation.setTraceId(traceId);
    tracker.correlation.setSpanId(parentSpanId);

    tracker.performance.record('http.POST /checkout', 120, { status: 200 });

    // 3. Child DB query span under parent HTTP span
    const childSpanId = generateSpanId();
    tracker.correlation.setParentId(parentSpanId);
    tracker.correlation.setSpanId(childSpanId);
    tracker.performance.record('db.insertOrder', 45);

    // 4. Capture error in processing
    tracker.errors.captureMessage('Minor card warning', 'warn');

    await tracker.flush();

    const timeline = await tracker.getTimeline(correlationId);

    expect(timeline.correlationId).toBe(correlationId);
    expect(timeline.events.length).toBeGreaterThanOrEqual(4);
    expect(timeline.summary.totalEvents).toBeGreaterThanOrEqual(4);
    expect(timeline.summary.errorCount).toBe(1);
    expect(timeline.tree.length).toBeGreaterThanOrEqual(1);

    await tracker.stop();
  });
});

