import { describe, it, expect, afterEach } from 'vitest';
import { FileStorage, validateStorageAdapter, type TrackerEvent } from '../../src/index.js';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile, readFile, unlink } from 'fs/promises';

describe('Storage: FileStorage Rotation & Corrupted Records', () => {
  const testDir = tmpdir();
  const testFileName = `trackflow-rot-${Date.now()}.ndjson`;
  const testFilePath = join(testDir, testFileName);
  const backupFilePath = testFilePath + '.backup';

  const mockEvent = (id: string, sizePadding = 'x'): TrackerEvent => ({
    id,
    type: 'activity',
    timestamp: new Date().toISOString(),
    appName: 'rot-test',
    environment: 'test',
    data: { padding: sizePadding.repeat(100) },
  });

  afterEach(async () => {
    try {
      await unlink(testFilePath);
    } catch {
      // ignore
    }
    try {
      await unlink(backupFilePath);
    } catch {
      // ignore
    }
  });

  it('should support storageDir and fileName constructor options', async () => {
    const storage = new FileStorage({
      storageDir: testDir,
      fileName: testFileName,
    });

    await storage.initialize();
    await storage.save(mockEvent('evt-1'));
    await storage.flush();

    const results = await storage.query({});
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('evt-1');
  });

  it('should rotate file when size exceeds maxFileSize', async () => {
    // Low maxFileSize (150 bytes) to trigger rotation after first event
    const storage = new FileStorage(testFilePath, { maxFileSize: 150 });
    await storage.initialize();

    await storage.save(mockEvent('first-event', 'A'));
    // The second save should detect size > 150 and rotate first-event into .backup
    await storage.save(mockEvent('second-event', 'B'));
    await storage.flush();

    const activeEvents = await storage.query({});
    expect(activeEvents).toHaveLength(1);
    expect(activeEvents[0]?.id).toBe('second-event');

    // Verify .backup exists and contains first-event
    const backupContent = await readFile(backupFilePath, 'utf-8');
    expect(backupContent).toContain('first-event');
  });

  it('should safely skip corrupted or malformed lines when querying', async () => {
    const storage = new FileStorage(testFilePath);
    await storage.initialize();

    // Write valid event + malformed corrupted line + another valid event
    const valid1 = JSON.stringify(mockEvent('valid-1')) + '\n';
    const corrupted = '{"id": "corrupted", broken json...\n';
    const valid2 = JSON.stringify(mockEvent('valid-2')) + '\n';

    await writeFile(testFilePath, valid1 + corrupted + valid2, 'utf-8');

    const results = await storage.query({});
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('valid-1');
    expect(ids).toContain('valid-2');
  });

  it('validateStorageAdapter should validate custom storage implementations', () => {
    // Missing required methods
    const invalidAdapter = {
      save: () => {},
    };
    const errors = validateStorageAdapter(invalidAdapter);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('Missing required method: initialize()');
    expect(errors).toContain('Missing required method: query()');

    // Complete adapter
    const validAdapter = {
      initialize: async () => {},
      save: async () => {},
      saveMany: async () => {},
      query: async () => [],
      flush: async () => {},
      close: async () => {},
    };
    expect(validateStorageAdapter(validAdapter)).toEqual([]);
  });
});
