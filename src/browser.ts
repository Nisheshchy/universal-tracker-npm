export * from './index.js';

export {
  BrowserCollector,
  type BrowserCollectorOptions,
  InteractionCollector,
  type InteractionCollectorOptions,
} from './integrations/browser/index.js';

import { createTracker, type UniversalTracker } from './engines/universal/UniversalTracker.js';
import type { TrackerConfig } from './types/index.js';
import { BrowserCollector, type BrowserCollectorOptions } from './integrations/browser/BrowserCollector.js';
import { InteractionCollector, type InteractionCollectorOptions } from './integrations/browser/InteractionCollector.js';

export interface BrowserTrackerOptions {
  config?: Partial<TrackerConfig>;
  collectorOptions?: BrowserCollectorOptions;
  interactionOptions?: InteractionCollectorOptions;
}

/**
 * Convenience helper to create a UniversalTracker and automatically install Browser collectors.
 */
export function createBrowserTracker(options?: BrowserTrackerOptions): {
  tracker: UniversalTracker;
  browserCollector: BrowserCollector;
  interactionCollector: InteractionCollector;
} {
  const tracker = createTracker(options?.config);
  const browserCollector = new BrowserCollector(tracker, options?.collectorOptions);
  const interactionCollector = new InteractionCollector(tracker, options?.interactionOptions);

  browserCollector.install();
  interactionCollector.install();

  return { tracker, browserCollector, interactionCollector };
}
