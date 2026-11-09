import { describe, it, expect, vi } from 'vitest';
import {
  SqliteStorage,
  type SqliteDatabaseLike,
  PostgresStorage,
  type PostgresClientLike,
  MongoStorage,
  type MongoCollectionLike,
  type TrackerEvent,
} from '../../src/index.js';

describe('Storage: Optional Database Adapters', () => {
  const sampleEvent: TrackerEvent = {
    id: 'db_evt_1',
    type: 'change',
    timestamp: '2026-01-01T12:00:00.000Z',
    appName: 'db-test-app',
    environment: 'production',
    userId: 'u_777',
    sessionId: 'sess_123',
    correlationId: 'cor_456',
    source: 'inventory',
    data: { item: 'widget', quantity: 10 },
  };

  describe('SqliteStorage', () => {
    it('should initialize tables and execute queries through mock sqlite database', async () => {
      const mockRun = vi.fn();
      const mockAll = vi.fn().mockReturnValue([
        {
          id: sampleEvent.id,
          type: sampleEvent.type,
          timestamp: sampleEvent.timestamp,
          appName: sampleEvent.appName,
          environment: sampleEvent.environment,
          userId: sampleEvent.userId,
          sessionId: sampleEvent.sessionId,
          correlationId: sampleEvent.correlationId,
          source: sampleEvent.source,
          data: JSON.stringify(sampleEvent.data),
        },
      ]);
      const mockDb: SqliteDatabaseLike = {
        exec: vi.fn(),
        prepare: vi.fn().mockReturnValue({
          run: mockRun,
          all: mockAll,
        }),
        close: vi.fn(),
      };

      const sqlite = new SqliteStorage(mockDb);
      await sqlite.initialize();
      expect(mockDb.exec).toHaveBeenCalled();

      await sqlite.save(sampleEvent);
      expect(mockRun).toHaveBeenCalled();

      const results = await sqlite.query({ userId: 'u_777' });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(sampleEvent.id);
      expect(results[0]?.data).toEqual(sampleEvent.data);

      await sqlite.close();
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe('PostgresStorage', () => {
    it('should initialize tables and execute parameterized queries', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [
          {
            id: sampleEvent.id,
            type: sampleEvent.type,
            timestamp: sampleEvent.timestamp,
            app_name: sampleEvent.appName,
            environment: sampleEvent.environment,
            user_id: sampleEvent.userId,
            session_id: sampleEvent.sessionId,
            correlation_id: sampleEvent.correlationId,
            source: sampleEvent.source,
            data: sampleEvent.data,
          },
        ],
      });

      const mockClient: PostgresClientLike = { query: mockQuery };
      const postgres = new PostgresStorage(mockClient);

      await postgres.initialize();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS'));

      await postgres.save(sampleEvent);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([sampleEvent.id, sampleEvent.type]),
      );

      const results = await postgres.query({ type: 'change' });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe(sampleEvent.id);
    });
  });

  describe('MongoStorage', () => {
    it('should initialize indexes and replaceOne/find documents', async () => {
      const mockCreateIndex = vi.fn().mockResolvedValue('index_name');
      const mockReplaceOne = vi.fn().mockResolvedValue({ acknowledged: true });
      const mockToArray = vi.fn().mockResolvedValue([
        {
          _id: 'mongo_internal_id',
          ...sampleEvent,
        },
      ]);

      const mockCollection: MongoCollectionLike = {
        createIndex: mockCreateIndex,
        replaceOne: mockReplaceOne,
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            skip: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                toArray: mockToArray,
              }),
            }),
          }),
        }),
      };

      const mongo = new MongoStorage(mockCollection);
      await mongo.initialize();
      expect(mockCreateIndex).toHaveBeenCalled();

      await mongo.save(sampleEvent);
      expect(mockReplaceOne).toHaveBeenCalledWith(
        { id: sampleEvent.id },
        sampleEvent,
        { upsert: true },
      );

      const results = await mongo.query({ type: 'change' });
      expect(results).toHaveLength(1);
      expect((results[0] as any)._id).toBeUndefined(); // internal _id stripped
      expect(results[0]?.id).toBe(sampleEvent.id);
    });
  });
});

