import { generateId } from '../../utils/generateId.js';
import { isoTimestamp } from '../../utils/time.js';

export interface Session {
  readonly id: string;
  readonly userId?: string;
  readonly startedAt: string;
  lastActiveAt: string;
  readonly metadata?: Record<string, unknown>;
  isActive: boolean;
}

export interface SessionManagerOptions {
  readonly sessionTimeoutMs?: number; // default 30 minutes
  readonly maxSessions?: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private activeSessionId?: string;
  private readonly sessionTimeoutMs: number;
  private readonly maxSessions: number;

  constructor(options?: SessionManagerOptions) {
    this.sessionTimeoutMs = options?.sessionTimeoutMs ?? 30 * 60 * 1000; // 30 mins
    this.maxSessions = options?.maxSessions ?? 10000;
  }

  /**
   * Start a new tracking session.
   */
  startSession(userId?: string, metadata?: Record<string, unknown>): Session {
    // If there is an existing active session, end it
    if (this.activeSessionId) {
      this.endSession(this.activeSessionId);
    }

    if (this.sessions.size >= this.maxSessions) {
      const oldestId = this.sessions.keys().next().value;
      if (oldestId !== undefined) {
        this.sessions.delete(oldestId);
      }
    }

    const now = isoTimestamp();
    const session: Session = {
      id: generateId(),
      userId,
      startedAt: now,
      lastActiveAt: now,
      metadata,
      isActive: true,
    };

    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;

    return session;
  }

  /**
   * End an active session by ID or the currently active session.
   */
  endSession(sessionId?: string): Session | undefined {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return undefined;

    const session = this.sessions.get(id);
    if (session) {
      session.isActive = false;
      session.lastActiveAt = isoTimestamp();
    }

    if (this.activeSessionId === id) {
      this.activeSessionId = undefined;
    }

    return session;
  }

  /**
   * Get session by ID.
   */
  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    // Check expiration
    const lastActive = new Date(session.lastActiveAt).getTime();
    if (Date.now() - lastActive > this.sessionTimeoutMs) {
      session.isActive = false;
    }

    return session;
  }

  /**
   * Get the currently active session.
   */
  getActiveSession(): Session | undefined {
    if (!this.activeSessionId) return undefined;
    const session = this.getSession(this.activeSessionId);
    if (!session || !session.isActive) {
      this.activeSessionId = undefined;
      return undefined;
    }
    return session;
  }

  /**
   * Touch session to keep it alive.
   */
  touchSession(sessionId?: string): void {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return;

    const session = this.sessions.get(id);
    if (session && session.isActive) {
      session.lastActiveAt = isoTimestamp();
    }
  }

  /**
   * Clear all sessions.
   */
  clear(): void {
    this.sessions.clear();
    this.activeSessionId = undefined;
  }
}

