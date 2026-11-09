# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-10

### Added
- **Core Engine**:
  - Unified `TrackerEvent` schema with strict typing and serialization safety.
  - Pub/sub `EventBus` with synchronous and asynchronous event broadcasting.
  - Multi-stage `EventProcessor` (validation, filtering, redaction, sampling, storage).
  - Bounded `EventQueue` with backpressure policies (`oldest`, `newest`) and auto-flush timers.
  - `LifecycleManager` for safe startup and graceful shutdown.
  - `CorrelationManager` for distributed tracing and session association.
- **Change Tracker Module**:
  - Deep structural object comparison (`ObjectComparator`) supporting nested properties, arrays, and ignore lists.
  - State snapshot management with automated LRU eviction (`SnapshotManager`).
  - Entity change history with diff timelines (`ChangeHistory`).
  - Node.js file modification watching adapter (`FileWatcher`).
- **Activity Tracker Module**:
  - User activity tracking (`login`, `logout`, `register`, `click`, custom actions).
  - Session tracking with expiration and touch mechanisms (`SessionManager`).
  - User identity traits and activity timelines (`UserActivity`).
- **Performance Tracker Module**:
  - High-resolution async and sync function execution measurement (`measure`).
  - Manual timers (`startTimer`).
  - Threshold violation alerts and slow operation flags (`ThresholdManager`).
  - Statistical summary calculations (count, min, max, avg, p95, p99) (`MetricsCollector`).
- **Error Tracker Module**:
  - Runtime exception and message capture (`capture`, `captureMessage`).
  - Stack trace parsing and deterministic FNV-1a error fingerprinting (`ErrorFingerprint`).
  - Duplicate error grouping and frequency tracking (`ErrorCollector`).
- **Storage & Exporters**:
  - Pluggable `StorageAdapter` interface.
  - In-memory bounded storage (`MemoryStorage`).
  - Append-only newline-delimited JSON storage (`FileStorage`).
  - JSON export utility (`JSONExporter`).
- **Integrations**:
  - Specialized Node.js entry point (`trackflow/node`) with system metrics collector (CPU, memory, event-loop delay).
  - Specialized Browser entry point (`trackflow/browser`) with navigation performance and interaction tracking.
  - Express middleware (`trackflow/express`) with HTTP latency, status code, and correlation tracing.
- **Developer Tools**:
  - Dual ESM & CommonJS build output with complete `.d.ts` declaration files.
  - Vitest test suite with 100% passing unit and integration tests.
  - Automated benchmark harness demonstrating 170k+ events/sec throughput.
