import type { LogLevel } from '../types/index.js';

/**
 * Numeric priority for each log level (higher = more severe).
 * Only messages at or above the configured level are emitted.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const PREFIX = '[TrackFlow]';

/**
 * Internal logger that respects the configured LogLevel.
 *
 * All output is prefixed with `[TrackFlow]` so library messages are
 * easily distinguishable from application logs.
 */
export class Logger {
  private level: LogLevel;
  private priority: number;

  constructor(level: LogLevel = 'warn') {
    this.level = level;
    this.priority = LOG_LEVEL_PRIORITY[this.level];
  }

  /** Update log level dynamically. */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.priority = LOG_LEVEL_PRIORITY[this.level];
  }

  /** Log a debug-level message. */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(PREFIX, message, ...args);
    }
  }

  /** Log an info-level message. */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(PREFIX, message, ...args);
    }
  }

  /** Log a warn-level message. */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(PREFIX, message, ...args);
    }
  }

  /** Log an error-level message. */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(PREFIX, message, ...args);
    }
  }

  /** Return the currently configured log level. */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Returns true when a message at the given level should be emitted
   * based on the configured threshold.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.priority;
  }
}

