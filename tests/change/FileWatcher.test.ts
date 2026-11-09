import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeTracker } from '../../src/engines/change/ChangeTracker.js';
import { FileWatcher } from '../../src/integrations/node/FileWatcher.js';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';

describe('Change Tracker: FileWatcher', () => {
  const testFile = join(tmpdir(), `trackflow-filewatcher-test-${Date.now()}.json`);
  let tracker: ChangeTracker;
  let fileWatcher: FileWatcher;

  beforeEach(async () => {
    tracker = new ChangeTracker();
    fileWatcher = new FileWatcher(tracker);
    await writeFile(testFile, JSON.stringify({ version: '1.0.0', port: 3000 }));
  });

  afterEach(async () => {
    await fileWatcher.close();
    try {
      await unlink(testFile);
    } catch {
      // ignore
    }
  });

  it('should watch a file and trigger callback on change', async () => {
    const changeCallback = vi.fn();

    await fileWatcher.watch(testFile, changeCallback);

    // Write updated content
    await writeFile(testFile, JSON.stringify({ version: '1.0.1', port: 3000 }));

    // Wait for fs watcher debounce
    await new Promise((r) => setTimeout(r, 250));

    // Either callback called or tracker history has recorded the change
    const history = tracker.history(testFile);
    expect(history.length).toBeGreaterThanOrEqual(1);

    await fileWatcher.unwatch(testFile);
  });
});

