import type { StorageAdapter, TrackerEvent, EventFilter } from '../types/index.js';

/**
 * Minimal duck-typed PostgreSQL client/pool interface compatible with `pg`.
 */
export interface PostgresClientLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface PostgresStorageOptions {
  readonly tableName?: string;
}

export class PostgresStorage implements StorageAdapter {
  private readonly client: PostgresClientLike;
  private readonly tableName: string;

  constructor(client: PostgresClientLike, options?: PostgresStorageOptions) {
    this.client = client;
    this.tableName = options?.tableName ?? 'trackflow_events';
  }

  async initialize(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id VARCHAR(64) PRIMARY KEY,
        type VARCHAR(32) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        app_name VARCHAR(128) NOT NULL,
        environment VARCHAR(64) NOT NULL,
        user_id VARCHAR(128),
        session_id VARCHAR(128),
        correlation_id VARCHAR(128),
        source VARCHAR(128),
        data JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_type ON ${this.tableName} (type);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName} (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_user_id ON ${this.tableName} (user_id);
    `);
  }

  async save(event: TrackerEvent): Promise<void> {
    const sql = `
      INSERT INTO ${this.tableName}
      (id, type, timestamp, app_name, environment, user_id, session_id, correlation_id, source, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        source = EXCLUDED.source;
    `;

    await this.client.query(sql, [
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
    ]);
  }

  async saveMany(events: ReadonlyArray<TrackerEvent>): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }

  async query(filters: EventFilter): Promise<ReadonlyArray<TrackerEvent>> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.type) {
      clauses.push(`type = $${paramIndex++}`);
      params.push(filters.type);
    }
    if (filters.source) {
      clauses.push(`source = $${paramIndex++}`);
      params.push(filters.source);
    }
    if (filters.userId) {
      clauses.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }
    if (filters.startTime) {
      clauses.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      clauses.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.endTime);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const sql = `
      SELECT id, type, timestamp, app_name, environment, user_id, session_id, correlation_id, source, data
      FROM ${this.tableName}
      ${where}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const result = await this.client.query(sql, params);
    const rows = result.rows as Array<{
      id: string;
      type: string;
      timestamp: Date | string;
      app_name: string;
      environment: string;
      user_id: string | null;
      session_id: string | null;
      correlation_id: string | null;
      source: string | null;
      data: unknown;
    }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type as TrackerEvent['type'],
      timestamp:
        typeof row.timestamp === 'string'
          ? row.timestamp
          : row.timestamp.toISOString(),
      appName: row.app_name,
      environment: row.environment,
      userId: row.user_id ?? undefined,
      sessionId: row.session_id ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      source: row.source ?? undefined,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    }));
  }

  async flush(): Promise<void> {
    // Handled by connection pool
  }

  async close(): Promise<void> {
    // Handled by connection pool
  }
}

