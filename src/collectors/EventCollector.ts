export interface EventCollector {
  readonly name: string;
  start(intervalMs?: number): void;
  stop(): void;
  collect(): Promise<void> | void;
  isRunning(): boolean;
}

