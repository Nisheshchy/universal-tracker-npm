import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorage, FileStorage, type TrackerEvent } from '../../src/index.js';
import { join } from 'path';
import { tmpdir } from 'os';
import { unlink } from 'fs/promises';

describe('Storage Adapters', () => {
  const sampleEvent1: TrackerEvent = {
    id: 'evt_1',
    type: 'activity',
    timestamp: '2026-01-01T10:00:00.000Z',
    appName: 'test-app',
    environment: 'test',
    userId: 'u1',
    source: 'web',
    data: { action: 'click' },
  };

  const sampleEvent2: TrackerEvent = {
    id: 'evt_2',
    type: 'error',
    timestamp: '2026-01-01T11:00:00.000Z',
    appName: 'test-app',
    environment: 'test',
    userId: 'u2',
    source: 'backend',
    data: { message: 'err' },
  };

  describe('MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(async () => {
      storage = new MemoryStorage(100);
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should save and query events with filters', async () => {
      await storage.save(sampleEvent1);
      await storage.save(sampleEvent2);

      expect(storage.count()).toBe(2);

      const all = await storage.query({});
      expect(all).toHaveLength(2);
      expect(all[0]?.id).toBe('evt_2'); // newest first

      const onlyErrors = await storage.query({ type: 'error' });
      expect(onlyErrors).toHaveLength(1);
      expect(onlyErrors[0]?.id).toBe('evt_2');

      const user1 = await storage.query({ userId: 'u1' });
      expect(user1).toHaveLength(1);
      expect(user1[0]?.id).toBe('evt_1');
    });

    it('should paginate results with limit and offset', async () => {
      await storage.save(sampleEvent1);
      await storage.save(sampleEvent2);

      const page1 = await storage.query({ limit: 1, offset: 0 });
      expect(page1).toHaveLength(1);
      expect(page1[0]?.id).toBe('evt_2');

      const page2 = await storage.query({ limit: 1, offset: 1 });
      expect(page2).toHaveLength(1);
      expect(page2[0]?.id).toBe('evt_1');
    });
  });

  describe('FileStorage', () => {
    const testFilePath = join(tmpdir(), `trackflow-test-${Date.now()}.ndjson`);
    let fileStorage: FileStorage;

    beforeEach(async () => {
      fileStorage = new FileStorage(testFilePath);
      await fileStorage.initialize();
    });

    afterEach(async () => {
      await fileStorage.close();
      try {
        await unlink(testFilePath);
      } catch {
        // ignore
      }
    });

    it('should persist events to disk and query them', async () => {
      await fileStorage.save(sampleEvent1);
      await fileStorage.save(sampleEvent2);
      await fileStorage.flush();

      const events = await fileStorage.query({});
      expect(events).toHaveLength(2);

      const errors = await fileStorage.query({ type: 'error' });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.id).toBe('evt_2');
    });
  });
});
