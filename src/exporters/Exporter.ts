import type { TrackerEvent } from '../types/index.js';

/**
 * Common interface for all TrackFlow exporters.
 *
 * An exporter transforms a collection of {@link TrackerEvent}s into a
 * serialised representation (e.g. JSON, CSV, binary protobuf) that can
 * be written to disk or transmitted over the wire.
 */
export interface ExporterInterface {
  /** A short, unique identifier for this exporter (e.g. `'json'`, `'csv'`). */
  readonly name: string;

  /**
   * Export the given events.
   *
   * @returns The serialised payload as a UTF-8 string or a binary Buffer.
   */
  export(events: TrackerEvent[]): Promise<string | Buffer>;
}
