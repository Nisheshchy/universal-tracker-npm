import { ErrorFingerprint } from './ErrorFingerprint.js';
import { isoTimestamp } from '../../utils/time.js';

export interface ParsedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly fingerprint: string;
}

export interface ErrorGroup {
  readonly fingerprint: string;
  readonly name: string;
  readonly message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  readonly sampleStack?: string;
}

export interface ErrorHistoryEntry {
  readonly id: string;
  readonly fingerprint: string;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;
}

export class ErrorCollector {
  private readonly groups = new Map<string, ErrorGroup>();
  private readonly history: ErrorHistoryEntry[] = [];
  private readonly dedupWindowMs: number;
  private readonly maxHistory: number;
  private readonly lastSeenTimestamps = new Map<string, number>();

  constructor(dedupWindowMs: number = 5000, maxHistory: number = 500) {
    this.dedupWindowMs = dedupWindowMs;
    this.maxHistory = maxHistory;
  }

  /**
   * Parse an unknown error into structured fields.
   */
  parseError(error: unknown): ParsedError {
    let name = 'Error';
    let message = 'Unknown error';
    let stack: string | undefined;

    if (error instanceof Error) {
      name = error.name || 'Error';
      message = error.message || 'Error occurred';
      stack = error.stack;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error !== null && typeof error === 'object') {
      const obj = error as Record<string, unknown>;
      name = typeof obj.name === 'string' ? obj.name : 'CustomError';
      message = typeof obj.message === 'string' ? obj.message : JSON.stringify(error);
      if (typeof obj.stack === 'string') {
        stack = obj.stack;
      }
    } else {
      message = String(error);
    }

    const fingerprint = ErrorFingerprint.generate(name, message, stack);

    return {
      name,
      message,
      stack,
      fingerprint,
    };
  }

  /**
   * Check if this error is a duplicate within the dedup window.
   */
  isDuplicate(fingerprint: string): boolean {
    const lastSeen = this.lastSeenTimestamps.get(fingerprint);
    if (!lastSeen) return false;
    return Date.now() - lastSeen < this.dedupWindowMs;
  }

  /**
   * Record error occurrence, update group stats and history.
   */
  record(
    id: string,
    parsed: ParsedError,
    context?: Record<string, unknown>,
  ): { group: ErrorGroup; isNewGroup: boolean } {
    const now = Date.now();
    const timestamp = isoTimestamp();
    this.lastSeenTimestamps.set(parsed.fingerprint, now);

    let isNewGroup = false;
    let group = this.groups.get(parsed.fingerprint);

    if (!group) {
      isNewGroup = true;
      group = {
        fingerprint: parsed.fingerprint,
        name: parsed.name,
        message: parsed.message,
        count: 1,
        firstSeen: timestamp,
        lastSeen: timestamp,
        sampleStack: parsed.stack,
      };
      this.groups.set(parsed.fingerprint, group);
    } else {
      group.count++;
      group.lastSeen = timestamp;
    }

    // Add to history
    this.history.unshift({
      id,
      fingerprint: parsed.fingerprint,
      name: parsed.name,
      message: parsed.message,
      stack: parsed.stack,
      timestamp,
      context,
    });

    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    return { group, isNewGroup };
  }

  /**
   * Get all aggregated error groups.
   */
  getGroups(): ErrorGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get specific error group by fingerprint.
   */
  getGroup(fingerprint: string): ErrorGroup | undefined {
    return this.groups.get(fingerprint);
  }

  /**
   * Get error history.
   */
  getHistory(limit?: number): ErrorHistoryEntry[] {
    return limit !== undefined ? this.history.slice(0, limit) : [...this.history];
  }

  /**
   * Clear error state.
   */
  clear(): void {
    this.groups.clear();
    this.history.length = 0;
    this.lastSeenTimestamps.clear();
  }
}
