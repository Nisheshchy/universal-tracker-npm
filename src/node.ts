export * from './index.js';

export {
  NodeCollector,
  type NodeCollectorOptions,
  FileWatcher,
} from './integrations/node/index.js';

export {
  SystemCollector,
  type SystemMetrics,
} from './collectors/SystemCollector.js';

import { createTracker, type UniversalTracker } from './engines/universal/UniversalTracker.js';
import type { TrackerConfig } from './types/index.js';
import { NodeCollector, type NodeCollectorOptions } from './integrations/node/NodeCollector.js';

export interface NodeTrackerOptions {
  config?: Partial<TrackerConfig>;
  collectorOptions?: NodeCollectorOptions;
}

/**
 * Convenience helper to create a UniversalTracker and automatically install NodeCollector.
 */
export function createNodeTracker(options?: NodeTrackerOptions): {
  tracker: UniversalTracker;
  nodeCollector: NodeCollector;
} {
  const tracker = createTracker(options?.config);
  const nodeCollector = new NodeCollector(tracker, options?.collectorOptions);
  nodeCollector.install();

  return { tracker, nodeCollector };
}
