import type { TrackerEvent } from '../types/index.js';
import type { ExporterInterface } from './Exporter.js';

/** Configuration options for {@link JSONExporter}. */
export interface JSONExporterOptions {
  /**
   * Whether to pretty-print the JSON output.
   * @default true
   */
  pretty?: boolean;

  /**
   * When `true`, the exported payload is wrapped in an envelope that
   * includes the export timestamp and total event count.
   * @default false
   */
  includeMetadata?: boolean;
}

/**
 * Exports events as a JSON string.
 *
 * By default the output is pretty-printed.  When `includeMetadata` is
 * enabled the events are wrapped in an envelope:
 *
 * ```json
 * {
 *   "exportedAt": "2024-01-01T00:00:00.000Z",
 *   "count": 42,
 *   "events": [ … ]
 * }
 * ```
 */
export class JSONExporter implements ExporterInterface {
  readonly name = 'json' as const;

  private readonly pretty: boolean;
  private readonly includeMetadata: boolean;

  constructor(options: JSONExporterOptions = {}) {
    this.pretty = options.pretty ?? true;
    this.includeMetadata = options.includeMetadata ?? false;
  }

  async export(events: TrackerEvent[]): Promise<string> {
    const indent = this.pretty ? 2 : undefined;

    if (this.includeMetadata) {
      const envelope = {
        exportedAt: new Date().toISOString(),
        count: events.length,
        events,
      };
      return JSON.stringify(envelope, null, indent);
    }

    return JSON.stringify(events, null, indent);
  }
}
