import { createTracker } from 'trackflow';
import { trackflowMiddleware, trackflowErrorMiddleware } from 'trackflow/express';

// Example demonstrating integration with Express applications
export function setupExpressApp(app: any) {
  const tracker = createTracker({
    appName: 'express-api-gateway',
    environment: 'production',
  });

  // 1. Request tracking middleware
  // Injects x-correlation-id, measures endpoint duration, tracks HTTP requests
  app.use(trackflowMiddleware(tracker));

  // 2. Application routes
  app.get('/api/users/:id', async (req: any, res: any) => {
    const user = await tracker.performance.measure('db.findUser', async () => {
      return { id: req.params.id, name: 'Alice' };
    });
    res.json(user);
  });

  app.get('/api/error-demo', () => {
    throw new Error('Something went wrong in endpoint handler');
  });

  // 3. Error tracking middleware
  // Captures unhandled route errors without altering the error response
  app.use(trackflowErrorMiddleware(tracker));

  return tracker;
}
