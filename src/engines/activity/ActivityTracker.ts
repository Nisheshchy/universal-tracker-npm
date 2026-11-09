import type { EventBus } from '../../core/EventBus.js';
import type { Logger } from '../../core/Logger.js';
import type { CorrelationManager } from '../../core/CorrelationManager.js';
import type { TrackerConfig, TrackerEvent, ActivityEventData } from '../../types/index.js';
import { generateId } from '../../utils/generateId.js';
import { isoTimestamp } from '../../utils/time.js';
import { SessionManager, type Session } from './SessionManager.js';
import { UserActivity, type ActivityTimelineEntry } from './UserActivity.js';

export interface ActivityTrackerOptions {
  readonly sessionTimeoutMs?: number;
  readonly maxTimelinePerUser?: number;
  readonly maxGlobalTimeline?: number;
}

export interface ActivityPayload {
  readonly userId?: string;
  readonly category?: string;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ActivityTracker {
  private readonly sessionManager: SessionManager;
  private readonly userActivity: UserActivity;
  private readonly eventBus?: EventBus;
  private readonly logger?: Logger;
  private readonly correlationManager?: CorrelationManager;
  private readonly config?: TrackerConfig;

  constructor(
    options?: ActivityTrackerOptions,
    dependencies?: {
      eventBus?: EventBus;
      logger?: Logger;
      correlationManager?: CorrelationManager;
      config?: TrackerConfig;
    },
  ) {
    this.sessionManager = new SessionManager({
      sessionTimeoutMs: options?.sessionTimeoutMs,
    });
    this.userActivity = new UserActivity(
      options?.maxTimelinePerUser,
      options?.maxGlobalTimeline,
    );
    this.eventBus = dependencies?.eventBus;
    this.logger = dependencies?.logger;
    this.correlationManager = dependencies?.correlationManager;
    this.config = dependencies?.config;
  }

  /**
   * Track an arbitrary user action or application activity.
   */
  track(action: string, payload?: ActivityPayload): TrackerEvent {
    const activeSession = this.sessionManager.getActiveSession();
    const effectiveUserId =
      payload?.userId ??
      this.correlationManager?.getUserId() ??
      activeSession?.userId;
    const effectiveSessionId =
      payload?.sessionId ??
      this.correlationManager?.getSessionId() ??
      activeSession?.id;
    const correlationId = this.correlationManager?.getCorrelationId();

    if (effectiveSessionId) {
      this.sessionManager.touchSession(effectiveSessionId);
    }

    const { category, metadata, ...rest } = payload ?? {};
    const combinedMetadata = {
      ...(metadata ?? {}),
      ...rest,
    };

    const activityData: ActivityEventData = {
      action,
      userId: effectiveUserId,
      sessionId: effectiveSessionId,
      category: category as string | undefined,
      metadata: Object.keys(combinedMetadata).length > 0 ? combinedMetadata : undefined,
    };

    const event: TrackerEvent = {
      id: generateId(),
      type: 'activity',
      timestamp: isoTimestamp(),
      appName: this.config?.appName ?? 'app',
      environment: this.config?.environment ?? 'development',
      userId: effectiveUserId,
      sessionId: effectiveSessionId,
      correlationId,
      source: 'ActivityTracker',
      data: activityData,
    };

    // Record in local timeline
    this.userActivity.record({
      id: event.id,
      action,
      timestamp: event.timestamp,
      userId: effectiveUserId,
      sessionId: effectiveSessionId,
      category: category as string | undefined,
      metadata: combinedMetadata,
    });

    this.eventBus?.emit('event:created', event);
    this.logger?.debug(`[ActivityTracker] Tracked action "${action}"`);

    return event;
  }

  /**
   * Helper to track user login.
   */
  login(
    userId: string,
    options?: { method?: string; metadata?: Record<string, unknown> },
  ): TrackerEvent {
    this.identify(userId);
    this.startSession(userId);
    return this.track('user.login', {
      userId,
      category: 'authentication',
      metadata: {
        method: options?.method ?? 'standard',
        ...(options?.metadata ?? {}),
      },
    });
  }

  /**
   * Helper to track user logout.
   */
  logout(userId?: string, metadata?: Record<string, unknown>): TrackerEvent {
    const event = this.track('user.logout', {
      userId,
      category: 'authentication',
      metadata,
    });
    this.endSession();
    return event;
  }

  /**
   * Helper to track user registration.
   */
  register(userId: string, metadata?: Record<string, unknown>): TrackerEvent {
    this.identify(userId);
    return this.track('user.register', {
      userId,
      category: 'authentication',
      metadata,
    });
  }

  /**
   * Helper to track button or interaction clicks.
   */
  click(elementId: string, metadata?: Record<string, unknown>): TrackerEvent {
    return this.track('ui.click', {
      category: 'ui',
      metadata: {
        elementId,
        ...(metadata ?? {}),
      },
    });
  }

  /**
   * Set user identity and persistent traits.
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    this.correlationManager?.setUserId(userId);
    this.userActivity.identify(userId, traits);
    this.logger?.debug(`[ActivityTracker] Identified user: ${userId}`);
  }

  /**
   * Start a new user tracking session.
   */
  startSession(userId?: string, metadata?: Record<string, unknown>): Session {
    const session = this.sessionManager.startSession(userId, metadata);
    this.correlationManager?.setSessionId(session.id);
    if (userId) {
      this.correlationManager?.setUserId(userId);
    }
    return session;
  }

  /**
   * End an active session.
   */
  endSession(sessionId?: string): Session | undefined {
    return this.sessionManager.endSession(sessionId);
  }

  /**
   * Get the active session.
   */
  getActiveSession(): Session | undefined {
    return this.sessionManager.getActiveSession();
  }

  /**
   * Get activity timeline.
   */
  getTimeline(
    userId?: string,
    options?: { limit?: number; category?: string },
  ): ActivityTimelineEntry[] {
    return this.userActivity.getTimeline(userId, options);
  }

  /**
   * Export activity timeline as JSON.
   */
  exportTimeline(userId?: string): string {
    return this.userActivity.export(userId);
  }

  /**
   * Clear all active sessions and user activity logs.
   */
  clear(): void {
    this.sessionManager.clear();
    this.userActivity.clear();
  }
}

