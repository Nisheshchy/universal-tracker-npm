import type { StorageAdapter, TrackerEvent, EventFilter } from '../types/index.js';

/**
 * Minimal duck-typed SQLite database interface compatible with
 * `better-sqlite3` and custom SQLite wrappers.
 */
export interface SqliteDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close?(): void;
}

export interface SqliteStorageOptions {
  readonly tableName?: string;
}

export class SqliteStorage implements StorageAdapter {
  private readonly db: SqliteDatabaseLike;
  private readonly tableName: string;

  constructor(db: SqliteDatabaseLike, options?: SqliteStorageOptions) {
    this.db = db;
    this.tableName = options?.tableName ?? 'trackflow_events';
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        appName TEXT NOT NULL,
        environment TEXT NOT NULL,
        userId TEXT,
        sessionId TEXT,
        correlationId TEXT,
        source TEXT,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_type ON ${this.tableName} (type);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName} (timestamp);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_userId ON ${this.tableName} (userId);
    `);
  }

  async save(event: TrackerEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName}
      (id, type, timestamp, appName, environment, userId, sessionId, correlationId, source, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.type,
      event.timestamp,
      event.appName,
      event.environment,
      event.userId ?? null,
      event.sessionId ?? null,
      event.correlationId ?? null,
      event.source ?? null,
      JSON.stringify(event.data),
    );
  }

  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }

  async query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.type) {
      clauses.push('type = ?');
      params.push(filters.type);
    }
    if (filters.source) {
      clauses.push('source = ?');
      params.push(filters.source);
    }
    if (filters.userId) {
      clauses.push('userId = ?');
      params.push(filters.userId);
    }
    if (filters.startTime) {
      clauses.push('timestamp >= ?');
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      clauses.push('timestamp <= ?');
      params.push(filters.endTime);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const sql = `
      SELECT id, type, timestamp, appName, environment, userId, sessionId, correlationId, source, data
      FROM ${this.tableName}
      ${where}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      type: string;
      timestamp: string;
      appName: string;
      environment: string;
      userId: string | null;
      sessionId: string | null;
      correlationId: string | null;
      source: string | null;
      data: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type as TrackerEvent['type'],
      timestamp: row.timestamp,
      appName: row.appName,
      environment: row.environment,
      userId: row.userId ?? undefined,
      sessionId: row.sessionId ?? undefined,
      correlationId: row.correlationId ?? undefined,
      source: row.source ?? undefined,
      data: JSON.parse(row.data),
    }));
  }

  async flush(): Promise<void> {
    // SQLite synchronous writes are immediate
  }

  async close(): Promise<void> {
    this.db.close?.();
  }
}
