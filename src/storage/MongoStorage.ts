import type { StorageAdapter, TrackerEvent, EventFilter } from '../types/index.js';

/**
 * Minimal duck-typed MongoDB collection interface compatible with official `mongodb` driver.
 */
export interface MongoCollectionLike {
  createIndex(specs: Record<string, number>, options?: Record<string, unknown>): Promise<string>;
  replaceOne(
    filter: Record<string, unknown>,
    replacement: unknown,
    options?: { upsert?: boolean },
  ): Promise<unknown>;
  insertMany?(documents: unknown[]): Promise<unknown>;
  find(filter: Record<string, unknown>): {
    sort(sort: Record<string, number>): {
      skip(count: number): {
        limit(count: number): {
          toArray(): Promise<unknown[]>;
        };
      };
    };
  };
}

export class MongoStorage implements StorageAdapter {
  private readonly collection: MongoCollectionLike;

  constructor(collection: MongoCollectionLike) {
    this.collection = collection;
  }

  async initialize(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ type: 1 });
    await this.collection.createIndex({ timestamp: -1 });
    await this.collection.createIndex({ userId: 1 });
  }

  async save(event: TrackerEvent): Promise<void> {
    await this.collection.replaceOne(
      { id: event.id },
      { ...event },
      { upsert: true },
    );
  }

  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }

  async query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>> {
    const mongoFilter: Record<string, unknown> = {};

    if (filters.type) {
      mongoFilter.type = filters.type;
    }
    if (filters.source) {
      mongoFilter.source = filters.source;
    }
    if (filters.userId) {
      mongoFilter.userId = filters.userId;
    }

    if (filters.startTime || filters.endTime) {
      const timeFilter: Record<string, string> = {};
      if (filters.startTime) timeFilter.$gte = filters.startTime;
      if (filters.endTime) timeFilter.$lte = filters.endTime;
      mongoFilter.timestamp = timeFilter;
    }

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const rawEvents = await this.collection
      .find(mongoFilter)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    return rawEvents.map((raw) => {
      const doc = { ...(raw as Record<string, unknown>) };
      delete doc._id;
      return doc as unknown as TrackerEvent;
    });
  }

  async flush(): Promise<void> {
    // Handled by driver write concern
  }

  async close(): Promise<void> {
    // Handled by mongo client
  }
}
