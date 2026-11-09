export class ThresholdManager {
  private readonly thresholds = new Map<string, number>();
  private defaultThreshold?: number;

  constructor(defaultThreshold?: number) {
    this.defaultThreshold = defaultThreshold;
  }

  /**
   * Set a threshold in milliseconds for a specific operation.
   */
  setThreshold(operation: string, thresholdMs: number): void {
    this.thresholds.set(operation, thresholdMs);
  }

  /**
   * Set the default threshold in milliseconds.
   */
  setDefaultThreshold(thresholdMs: number): void {
    this.defaultThreshold = thresholdMs;
  }

  /**
   * Get the configured threshold for an operation.
   */
  getThreshold(operation: string): number | undefined {
    return this.thresholds.get(operation) ?? this.defaultThreshold;
  }

  /**
   * Check if a duration exceeded the threshold for an operation.
   */
  isExceeded(operation: string, duration: number): { exceeded: boolean; threshold?: number } {
    const threshold = this.getThreshold(operation);
    if (threshold === undefined) {
      return { exceeded: false };
    }
    return {
      exceeded: duration > threshold,
      threshold,
    };
  }

  /**
   * Clear all thresholds.
   */
  clear(): void {
    this.thresholds.clear();
    this.defaultThreshold = undefined;
  }
}

