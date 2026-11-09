# Change Tracker Module

The Change Tracker monitors mutations across objects, models, and files.

## Features

- Deep recursive property comparison
- Detection of added, updated, and deleted properties
- Array item modification detection
- Object snapshots & state history
- Configurable ignored properties
- Node.js file modification watching

## Usage

### Object Change Tracking

```typescript
// Initial snapshot is saved automatically on first call
tracker.changes.track('user_1', { name: 'Alice', role: 'developer' });

// Subsequent calls detect diffs, update snapshot, and emit 'change' events
const diffs = tracker.changes.track('user_1', { name: 'Alice', role: 'lead' });
console.log(diffs);
// [
//   {
//     property: 'role',
//     path: 'role',
//     before: 'developer',
//     after: 'lead',
//     changeType: 'updated'
//   }
// ]
```

### Direct Comparison

```typescript
const diffs = tracker.changes.compare(
  { count: 1, items: [1, 2] },
  { count: 2, items: [1, 3] },
  { ignoredProperties: ['count'] }
);
```

### Snapshots & History

```typescript
// Save explicit snapshot
tracker.changes.snapshot('config', currentConfig);

// Retrieve snapshot
const snapshot = tracker.changes.getSnapshot('config');

// Query change history for entity
const history = tracker.changes.history('user_1', 10);
```

### Watching Files (Node.js)

```typescript
const watcher = await tracker.changes.watchFile('./config.json', (diffs) => {
  console.log('File changed:', diffs);
});

// Later, stop watching
await watcher.close();
```

