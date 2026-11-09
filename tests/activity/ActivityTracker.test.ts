import { describe, it, expect, beforeEach } from 'vitest';
import {
  ActivityTracker,
  SessionManager,
  UserActivity,
  EventBus,
  type TrackerEvent,
} from '../../src/index.js';

describe('Activity Tracker Module', () => {
  describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = new SessionManager({ sessionTimeoutMs: 1000 });
    });

    it('should start, retrieve, and end sessions', () => {
      const session = sessionManager.startSession('user_1', { plan: 'pro' });
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user_1');
      expect(session.isActive).toBe(true);

      const active = sessionManager.getActiveSession();
      expect(active?.id).toBe(session.id);

      sessionManager.endSession();
      expect(sessionManager.getActiveSession()).toBeUndefined();
    });

    it('should expire inactive sessions based on timeout', async () => {
      const quickSessionManager = new SessionManager({ sessionTimeoutMs: 10 });
      const session = quickSessionManager.startSession('user_2');

      await new Promise((r) => setTimeout(r, 20));

      const retrieved = quickSessionManager.getSession(session.id);
      expect(retrieved?.isActive).toBe(false);
      expect(quickSessionManager.getActiveSession()).toBeUndefined();
    });
  });

  describe('UserActivity', () => {
    it('should track user traits and activity timelines', () => {
      const userActivity = new UserActivity();

      userActivity.identify('u100', { email: 'test@example.com', role: 'admin' });
      expect(userActivity.getTraits('u100')?.email).toBe('test@example.com');

      userActivity.record({
        id: '1',
        action: 'button.click',
        timestamp: new Date().toISOString(),
        userId: 'u100',
        category: 'ui',
      });

      userActivity.record({
        id: '2',
        action: 'file.download',
        timestamp: new Date().toISOString(),
        userId: 'u100',
        category: 'download',
      });

      const timeline = userActivity.getTimeline('u100');
      expect(timeline).toHaveLength(2);

      const filtered = userActivity.getTimeline('u100', { category: 'ui' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.action).toBe('button.click');
    });
  });

  describe('ActivityTracker full workflow', () => {
    it('should track custom activities and emit events', () => {
      const eventBus = new EventBus();
      const emittedEvents: TrackerEvent[] = [];
      eventBus.on('event:created', (e) => emittedEvents.push(e as TrackerEvent));

      const tracker = new ActivityTracker(undefined, { eventBus });

      // Track login
      const loginEvent = tracker.login('user_abc', { method: 'oauth' });
      expect(loginEvent.type).toBe('activity');
      expect(loginEvent.userId).toBe('user_abc');

      // Track custom activity
      const customEvent = tracker.track('project.create', {
        category: 'workspace',
        projectId: 'p_123',
      });
      expect(customEvent.userId).toBe('user_abc'); // associated with current session user

      // Track click
      const clickEvent = tracker.click('btn-submit');
      expect(clickEvent.data).toMatchObject({
        action: 'ui.click',
        category: 'ui',
      });

      // Track logout
      tracker.logout('user_abc');

      expect(emittedEvents.length).toBe(4);
    });
  });
});
