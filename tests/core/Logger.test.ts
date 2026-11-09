import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../../src/core/Logger.js';

describe('Core: Logger', () => {
  it('should respect configured log levels and prefix output with [TrackFlow]', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const logger = new Logger('warn');
    logger.debug('debug message');
    logger.warn('warning message');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[TrackFlow]', 'warning message');

    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('should mute all output when log level is silent', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = new Logger('silent');
    logger.error('severe error');
    logger.warn('minor warning');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should allow dynamic log level updates via setLevel()', () => {
    const logger = new Logger('warn');
    expect(logger.getLevel()).toBe('warn');

    logger.setLevel('debug');
    expect(logger.getLevel()).toBe('debug');
  });
});

