import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTracker,
  type UniversalTracker,
  type TrackFlowPlugin,
} from '../../src/index.js';

describe('Universal Tracker Integration Suite', () => {
  let tracker: UniversalTracker;

  beforeEach(async () => {
    tracker = createTracker({
      appName: 'test-suite',
      environment: 'testing',
      debug: false,
      redaction: {
        enabled: true,
        fields: ['password', 'secretKey', 'token'],
        patterns: [/credit.*card/i],
        replacement: '[CENSORED]',
      },
      queue: {
        maxSize: 500,
        dropPolicy: 'oldest',
      },
    });

    await tracker.start();
  });

  afterEach(async () => {
    await tracker.stop();
  });

  it('should run full lifecycle and coordinate all tracking engines', async () => {
    expect(tracker.getStatus().state).toBe('running');

    // 1. Changes
    tracker.changes.track('user_profile', { name: 'Alice', role: 'admin' });
    const diffs = tracker.changes.track('user_profile', { name: 'Alice', role: 'superadmin' });
    expect(diffs).toHaveLength(1);

    // 2. Activity
    tracker.activities.login('alice_1', { method: 'sso' });
    tracker.activities.track('document.view', { docId: 'doc_42' });

    // 3. Performance
    const mathResult = await tracker.performance.measure('compute-primes', () => {
      let count = 0;
      for (let i = 2; i < 1000; i++) count++;
      return count;
    });
    expect(mathResult).toBe(998);

    // 4. Error
    tracker.errors.capture(new Error('Sample caught error'), { service: 'payment' });

    // Flush events into storage
    await tracker.flush();

    // Query storage
    const allEvents = await tracker.query();
    expect(allEvents.length).toBeGreaterThanOrEqual(4);

    const types = new Set(allEvents.map((e) => e.type));
    expect(types.has('change')).toBe(true);
    expect(types.has('activity')).toBe(true);
    expect(types.has('performance')).toBe(true);
    expect(types.has('error')).toBe(true);
  });

  it('should redact sensitive fields based on redaction config', async () => {
    tracker.activities.track('user.signup', {
      username: 'nishesh',
      password: 'superSecretPassword123!',
      secretKey: 'key_abc',
      creditCardNumber: '4111-2222-3333-4444',
      publicInfo: 'visible',
    });

    await tracker.flush();

    const events = await tracker.query({ type: 'activity' });
    const signupEvent = events.find(
      (e) => (e.data as any)?.action === 'user.signup',
    );
    expect(signupEvent).toBeDefined();

    const metadata = (signupEvent?.data as any)?.metadata;
    expect(metadata.username).toBe('nishesh');
    expect(metadata.publicInfo).toBe('visible');
    expect(metadata.password).toBe('[CENSORED]');
    expect(metadata.secretKey).toBe('[CENSORED]');
    expect(metadata.creditCardNumber).toBe('[CENSORED]');
  });

  it('should allow custom plugins to extend the pipeline', async () => {
    let pluginInstalled = false;
    let enrichedCount = 0;

    const testPlugin: TrackFlowPlugin = {
      name: 'enrichment-plugin',
      version: '1.0.0',
      install(context) {
        pluginInstalled = true;
        context.addProcessor((event) => {
          enrichedCount++;
          return {
            ...event,
            data: {
              ...(event.data as Record<string, unknown>),
              enrichedByPlugin: true,
            },
          };
        });
      },
    };

    await tracker.use(testPlugin);
    expect(pluginInstalled).toBe(true);
    expect(tracker.getStatus().plugins).toContain('enrichment-plugin');

    tracker.activities.track('test.action');
    await tracker.flush();

    expect(enrichedCount).toBeGreaterThanOrEqual(1);
    const events = await tracker.query({ type: 'activity' });
    const event = events.find((e) => (e.data as any)?.action === 'test.action');
    expect((event?.data as any)?.enrichedByPlugin).toBe(true);
  });

  it('should export events in valid JSON format', async () => {
    tracker.activities.track('export.test');
    await tracker.flush();

    const jsonString = await tracker.export('json');
    expect(typeof jsonString).toBe('string');

    const parsed = JSON.parse(jsonString);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
  });

  it('should correlate events with correlation IDs', async () => {
    tracker.setCorrelationId('request_abc_999');

    tracker.activities.track('user.step1');
    tracker.performance.record('db.query', 25);
    tracker.errors.captureMessage('minor issue');

    await tracker.flush();

    const events = await tracker.query();
    const correlated = events.filter((e) => e.correlationId === 'request_abc_999');
    expect(correlated.length).toBe(3);
  });
});

