import type { UniversalTracker } from '../../engines/universal/UniversalTracker.js';
import { generateCorrelationId } from '../../utils/generateId.js';

export interface RequestLike {
  method?: string;
  url?: string;
  path?: string;
  route?: { path?: string };
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string };
  userId?: string;
}

export interface ResponseLike {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  getHeader?: (name: string) => string | number | string[] | undefined;
  on?: (event: string, callback: () => void) => void;
}

export interface NextFunctionLike {
  (err?: unknown): void;
}

export interface ExpressMiddlewareOptions {
  readonly recordPerformance?: boolean;
  readonly recordActivity?: boolean;
  readonly captureErrors?: boolean;
  readonly headerName?: string;
}

/**
 * Express HTTP request tracking middleware.
 */
export function trackflowMiddleware(
  tracker: UniversalTracker,
  options?: ExpressMiddlewareOptions,
) {
  const headerName = (options?.headerName ?? 'x-correlation-id').toLowerCase();
  const recordPerformance = options?.recordPerformance ?? true;
  const recordActivity = options?.recordActivity ?? true;

  return function (req: RequestLike, res: ResponseLike, next: NextFunctionLike): void {
    const correlationId =
      (req.headers?.[headerName] as string) || generateCorrelationId();

    if (res.setHeader) {
      res.setHeader(headerName, correlationId);
    }

    const startTime = Date.now();
    const routePath = req.route?.path || req.path || req.url || 'unknown';
    const method = req.method || 'GET';
    const operation = `${method} ${routePath}`;

    const userId = req.user?.id || req.userId;

    if (recordActivity) {
      tracker.activities.track('http.request', {
        userId,
        category: 'http',
        metadata: {
          method,
          path: routePath,
          correlationId,
        },
      });
    }

    if (res.on) {
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode ?? 200;

        if (recordPerformance) {
          tracker.performance.record(
            operation,
            duration,
            { statusCode },
            {
              method,
              statusCode,
              correlationId,
              userId,
            },
          );
        }
      });
    }

    next();
  };
}

/**
 * Express error handling middleware to capture request errors.
 */
export function trackflowErrorMiddleware(tracker: UniversalTracker) {
  return function (
    err: unknown,
    req: RequestLike,
    _res: ResponseLike,
    next: NextFunctionLike,
  ): void {
    const routePath = req.route?.path || req.path || req.url || 'unknown';
    const method = req.method || 'GET';
    const userId = req.user?.id || req.userId;

    tracker.errors.capture(err, {
      source: 'express.errorMiddleware',
      method,
      path: routePath,
      userId,
    });

    // Pass the error to the next error handler — NEVER swallow the error!
    next(err);
  };
}
