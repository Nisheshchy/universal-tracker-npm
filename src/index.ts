// Core & Universal Tracker
export {
  UniversalTracker,
  createTracker,
  type TrackerStatus,
} from './engines/universal/UniversalTracker.js';

// Core Subsystems
export { EventBus, BUILT_IN_EVENTS, type BuiltInEvent, type EventHandler } from './core/EventBus.js';
export { EventProcessor } from './core/EventProcessor.js';
export { EventQueue } from './core/EventQueue.js';
export { LifecycleManager, type LifecycleState } from './core/LifecycleManager.js';
export { CorrelationManager, type CorrelationContext } from './core/CorrelationManager.js';
export { Logger } from './core/Logger.js';
export { createConfig, validateConfig } from './core/Config.js';

// Tracking Engines
export {
  ChangeTracker,
  ObjectComparator,
  SnapshotManager,
  ChangeHistory,
  type PropertyDiff,
  type ComparisonOptions,
  type SnapshotEntry,
  type ChangeHistoryEntry,
  type ChangeTrackerOptions,
} from './engines/change/index.js';

export {
  ActivityTracker,
  SessionManager,
  UserActivity,
  type Session,
  type ActivityTimelineEntry,
  type ActivityTrackerOptions,
  type ActivityPayload,
} from './engines/activity/index.js';

export {
  PerformanceTracker,
  MetricsCollector,
  ThresholdManager,
  type OperationSummary,
  type PerformanceTrackerOptions,
} from './engines/performance/index.js';

export {
  ErrorTracker,
  ErrorCollector,
  ErrorFingerprint,
  type ParsedError,
  type ErrorGroup,
  type ErrorHistoryEntry,
  type ErrorTrackerOptions,
} from './engines/error/index.js';

// Storage & Exporters
export { MemoryStorage, FileStorage, type FileStorageOptions } from './storage/index.js';
export { JSONExporter, type JSONExporterOptions, type ExporterInterface } from './exporters/index.js';

// Plugins
export {
  PluginManager,
  type TrackFlowPlugin,
  type PluginContext,
} from './plugins/index.js';

// Types
export type {
  TrackerEventType,
  TrackerEvent,
  ChangeType,
  ChangeEventData,
  ActivityEventData,
  PerformanceEventData,
  ErrorEventData,
  EventFilter,
  EventBatchConfig,
  LogLevel,
  TrackingConfig,
  RedactionConfig,
  QueueConfig,
  SamplingConfig,
  TrackerConfig,
  StorageAdapter,
  StorageType,
  StorageConfig,
} from './types/index.js';

// Utilities
export { generateId, generateCorrelationId } from './utils/generateId.js';
export { deepClone, deepEqual } from './utils/deepClone.js';
export { redactSensitiveData } from './utils/redact.js';
export { isoTimestamp, hrtime, elapsed } from './utils/time.js';
