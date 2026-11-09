import { describe, it, expect, vi } from 'vitest';
import { createTracker } from '../../src/engines/universal/UniversalTracker.js';
import type { TrackFlowPlugin } from '../../src/plugins/PluginInterface.js';

describe('Advanced Plugin System & Lifecycle Hooks', () => {
  it('should validate plugin dependencies', async () => {
    const tracker = createTracker({ appName: 'plugin-dep-test' });

    const dependentPlugin: TrackFlowPlugin = {
      name: 'dependent-plugin',
      dependencies: ['base-auth-plugin'],
      install: vi.fn(),
    };

    // Missing dependency
    await expect(tracker.use(dependentPlugin)).rejects.toThrow(
      'requires dependency "base-auth-plugin"',
    );

    // Install base dependency first
    const basePlugin: TrackFlowPlugin = {
      name: 'base-auth-plugin',
      install: vi.fn(),
    };
    await tracker.use(basePlugin);

    // Now dependent plugin installs successfully
    await expect(tracker.use(dependentPlugin)).resolves.not.toThrow();
  });

  it('should execute beforeProcess and afterProcess hooks safely with error isolation', async () => {
    const tracker = createTracker({ appName: 'plugin-hook-test' });
    await tracker.start();

    const afterProcessCalls: string[] = [];

    const hookPlugin: TrackFlowPlugin = {
      name: 'hook-plugin',
      install: vi.fn(),
      beforeProcess(event) {
        // Drop any event with dropMe flag
        const data = event.data as Record<string, unknown>;
        if (data?.dropMe || (data?.metadata as Record<string, unknown>)?.dropMe) {
          return null;
        }
        // Enrich event
        return {
          ...event,
          metadata: { ...event.metadata, pluginEnriched: true },
        };
      },
      afterProcess(event) {
        afterProcessCalls.push(event.id);
      },
    };

    const faultyPlugin: TrackFlowPlugin = {
      name: 'faulty-plugin',
      install: vi.fn(),
      beforeProcess() {
        throw new Error('Plugin hook threw unexpectedly!');
      },
    };

    await tracker.use(hookPlugin);
    await tracker.use(faultyPlugin); // Should not crash the tracker

    // 1. Regular activity event
    tracker.activities.track('test.action', { key: 'val' });

    // 2. Event that should be dropped by hookPlugin
    tracker.activities.track('test.dropped', { dropMe: true });

    await tracker.flush();

    const events = await tracker.query();
    expect(events.length).toBe(1);
    expect(events[0].metadata?.pluginEnriched).toBe(true);
    expect(afterProcessCalls.length).toBe(1);

    await tracker.stop();
  });

  it('should manage custom collector lifecycles and clean up on unregister', async () => {
    const tracker = createTracker({ appName: 'plugin-cleanup-test' });

    const startSpy = vi.fn();
    const stopSpy = vi.fn();
    const uninstallSpy = vi.fn();

    const collectorPlugin: TrackFlowPlugin = {
      name: 'collector-plugin',
      install(context) {
        context.addCollector({
          start: startSpy,
          stop: stopSpy,
        });
      },
      uninstall: uninstallSpy,
    };

    await tracker.use(collectorPlugin);
    expect(startSpy).toHaveBeenCalledTimes(1);

    await tracker.removePlugin('collector-plugin');
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(uninstallSpy).toHaveBeenCalledTimes(1);
    expect(tracker.plugins.hasPlugin('collector-plugin')).toBe(false);
  });
});
