import { describe, it, expect } from 'vitest';
import {
  ErrorTracker,
  ErrorCollector,
  ErrorFingerprint,
  EventBus,
  type TrackerEvent,
} from '../../src/index.js';

describe('Error Tracker Module', () => {
  describe('ErrorFingerprint', () => {
    it('should generate identical fingerprints for errors with normalized message variations', () => {
      const fp1 = ErrorFingerprint.generate(
        'NotFoundError',
        'User 12345 not found in system',
        'at Object.get (/app/user.js:10:5)',
      );

      const fp2 = ErrorFingerprint.generate(
        'NotFoundError',
        'User 67890 not found in system',
        'at Object.get (/app/user.js:10:5)',
      );

      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different error types', () => {
      const fp1 = ErrorFingerprint.generate('TypeError', 'Cannot read property of undefined');
      const fp2 = ErrorFingerprint.generate('RangeError', 'Maximum call stack size exceeded');

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('ErrorCollector', () => {
    it('should aggregate duplicate errors into groups', () => {
      const collector = new ErrorCollector(5000);
      const parsed = collector.parseError(new Error('Network timeout'));

      collector.record('e1', parsed, { route: '/api/v1' });
      collector.record('e2', parsed, { route: '/api/v2' });

      const group = collector.getGroup(parsed.fingerprint);
      expect(group).toBeDefined();
      expect(group?.count).toBe(2);

      const history = collector.getHistory();
      expect(history).toHaveLength(2);
    });
  });

  describe('ErrorTracker workflow', () => {
    it('should capture Error instances with context and stack trace', () => {
      const eventBus = new EventBus();
      const events: TrackerEvent[] = [];
      eventBus.on('event:created', (e) => events.push(e as TrackerEvent));

      const tracker = new ErrorTracker(undefined, { eventBus });

      const err = new TypeError('Invalid argument provided');
      const event = tracker.capture(err, { component: 'AuthService' });

      expect(event.type).toBe('error');
      const data = event.data as any;
      expect(data.name).toBe('TypeError');
      expect(data.message).toBe('Invalid argument provided');
      expect(data.stack).toBeDefined();
      expect(data.fingerprint).toBeDefined();
      expect(data.context.component).toBe('AuthService');
      expect(events).toHaveLength(1);
    });

    it('should support captureMessage for non-Error warnings', () => {
      const tracker = new ErrorTracker();
      const event = tracker.captureMessage('Deprecated endpoint accessed', { endpoint: '/v1/users' });

      expect(event.type).toBe('error');
      const data = event.data as any;
      expect(data.message).toBe('Deprecated endpoint accessed');
    });

    it('should respect custom error filtering', () => {
      const eventBus = new EventBus();
      const events: TrackerEvent[] = [];
      eventBus.on('event:created', (e) => events.push(e as TrackerEvent));

      // Filter out AbortError
      const tracker = new ErrorTracker(
        { filter: (parsed) => parsed.name !== 'AbortError' },
        { eventBus },
      );

      tracker.capture(new DOMException('Request aborted', 'AbortError'));
      expect(events).toHaveLength(0); // filtered, not emitted
    });
  });
});

