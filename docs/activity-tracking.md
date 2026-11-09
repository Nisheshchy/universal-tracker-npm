# Activity Tracker Module

The Activity Tracker monitors user actions, sessions, and application interaction events.

## Features

- User authentication tracking (login, logout, registration)
- Custom action & business event tracking
- Automated session tracking with configurable timeout
- User identity & traits management
- Activity timelines per user and global
- JSON export of timelines

## Usage

### User Authentication & Identity

```typescript
// Identify user and attach persistent traits
tracker.activities.identify('usr_99', {
  name: 'Nishesh Chaudhary',
  role: 'admin',
  tier: 'enterprise',
});

// Track login
tracker.activities.login('usr_99', { method: 'github_oauth' });

// Track logout
tracker.activities.logout('usr_99');
```

### Tracking Custom Actions

```typescript
tracker.activities.track('document.exported', {
  docId: 'doc_101',
  format: 'pdf',
  pageCount: 14,
});

// Track button or UI clicks
tracker.activities.click('btn-save-project', { projectId: 'prj_42' });
```

### Sessions

```typescript
// Explicitly start a new session
const session = tracker.activities.startSession('usr_99', { device: 'mobile' });
console.log('Session ID:', session.id);

// End session
tracker.activities.endSession();
```

### Timeline & Export

```typescript
// Get recent user actions
const userTimeline = tracker.activities.getTimeline('usr_99', { limit: 20 });

// Export timeline as JSON string
const jsonExport = tracker.activities.exportTimeline('usr_99');
```

