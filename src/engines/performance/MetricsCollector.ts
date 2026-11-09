export interface OperationSummary {
  readonly operation: string;
  readonly count: number;
  readonly totalDuration: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p95: number;
  readonly p99: number;
}

export class MetricsCollector {
  private readonly measurements = new Map<string, number[]>();
  private readonly maxSamplesPerOperation: number;

  constructor(maxSamplesPerOperation: number = 1000) {
    this.maxSamplesPerOperation = maxSamplesPerOperation;
  }

  /**
   * Record a duration measurement for an operation.
   */
  record(operation: string, duration: number): void {
    let samples = this.measurements.get(operation);
    if (!samples) {
      samples = [];
      this.measurements.set(operation, samples);
    }

    samples.push(duration);

    if (samples.length > this.maxSamplesPerOperation) {
      samples.shift(); // remove oldest
    }
  }

  /**
   * Calculate summary metrics for a given operation.
   */
  getSummary(operation: string): OperationSummary | undefined {
    const samples = this.measurements.get(operation);
    if (!samples || samples.length === 0) return undefined;

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const totalDuration = sorted.reduce((sum, d) => sum + d, 0);
    const min = sorted[0] ?? 0;
    const max = sorted[count - 1] ?? 0;
    const avg = totalDuration / count;

    const p95Index = Math.min(Math.floor(count * 0.95), count - 1);
    const p99Index = Math.min(Math.floor(count * 0.99), count - 1);

    const p95 = sorted[p95Index] ?? max;
    const p99 = sorted[p99Index] ?? max;

    return {
      operation,
      count,
      totalDuration,
      min,
      max,
      avg: Math.round(avg * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
    };
  }

  /**
   * Get summaries for all tracked operations.
   */
  getAllSummaries(): Record<string, OperationSummary> {
    const result: Record<string, OperationSummary> = {};
    for (const op of this.measurements.keys()) {
      const summary = this.getSummary(op);
      if (summary) {
        result[op] = summary;
      }
    }
    return result;
  }

  /**
   * Clear all recorded metrics.
   */
  clear(): void {
    this.measurements.clear();
  }
}
