export interface ActivityTimelineEntry {
  readonly id: string;
  readonly action: string;
  readonly timestamp: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly category?: string;
  readonly metadata?: Record<string, unknown>;
}

export class UserActivity {
  private readonly userTraits = new Map<string, Record<string, unknown>>();
  private readonly timelines = new Map<string, ActivityTimelineEntry[]>();
  private readonly globalTimeline: ActivityTimelineEntry[] = [];
  private readonly maxTimelinePerUser: number;
  private readonly maxGlobalTimeline: number;

  constructor(maxTimelinePerUser: number = 200, maxGlobalTimeline: number = 1000) {
    this.maxTimelinePerUser = maxTimelinePerUser;
    this.maxGlobalTimeline = maxGlobalTimeline;
  }

  /**
   * Set user identity and traits.
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    const existing = this.userTraits.get(userId) ?? {};
    this.userTraits.set(userId, {
      ...existing,
      ...(traits ?? {}),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get traits for a user.
   */
  getTraits(userId: string): Record<string, unknown> | undefined {
    return this.userTraits.get(userId);
  }

  /**
   * Record an activity entry in timeline.
   */
  record(entry: ActivityTimelineEntry): void {
    // Record globally
    this.globalTimeline.unshift(entry);
    if (this.globalTimeline.length > this.maxGlobalTimeline) {
      this.globalTimeline.pop();
    }

    // Record per user if userId provided
    if (entry.userId) {
      let userList = this.timelines.get(entry.userId);
      if (!userList) {
        userList = [];
        this.timelines.set(entry.userId, userList);
      }
      userList.unshift(entry);
      if (userList.length > this.maxTimelinePerUser) {
        userList.pop();
      }
    }
  }

  /**
   * Get activity timeline with filtering.
   */
  getTimeline(
    userId?: string,
    options?: { limit?: number; category?: string },
  ): ActivityTimelineEntry[] {
    let source = userId ? (this.timelines.get(userId) ?? []) : this.globalTimeline;

    if (options?.category) {
      source = source.filter((item) => item.category === options.category);
    }

    if (options?.limit !== undefined) {
      return source.slice(0, options.limit);
    }

    return [...source];
  }

  /**
   * Export activity timeline as JSON.
   */
  export(userId?: string): string {
    const data = this.getTimeline(userId);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.userTraits.clear();
    this.timelines.clear();
    this.globalTimeline.length = 0;
  }
}
