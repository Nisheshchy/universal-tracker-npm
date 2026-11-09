# Plugin Architecture

TrackFlow provides an extensible plugin system allowing developers to customize event processing, add external exporters, or hook into lifecycle events.

## Creating a Plugin

Implement the `TrackFlowPlugin` interface:

```typescript
import type { TrackFlowPlugin, PluginContext } from 'trackflow';

export const slackNotificationPlugin: TrackFlowPlugin = {
  name: 'slack-alerts',
  version: '1.0.0',

  async install(context: PluginContext) {
    // 1. Subscribe to internal events
    context.on('event:created', (event: any) => {
      if (event.type === 'error') {
        sendSlackAlert(`🚨 Error in ${event.appName}: ${event.data.message}`);
      }
    });

    // 2. Add custom middleware to the event processing pipeline
    context.addProcessor((event) => {
      // Return modified event or null to drop event
      return {
        ...event,
        data: {
          ...(event.data as Record<string, unknown>),
          inspectedBySlackPlugin: true,
        },
      };
    });
  },

  async uninstall() {
    // Clean up connections if necessary
  },
};
```

## Registering Plugins

```typescript
import { createTracker } from 'trackflow';
import { slackNotificationPlugin } from './slackPlugin';

const tracker = createTracker();
await tracker.use(slackNotificationPlugin);
```

