import type { UniversalTracker } from '../../engines/universal/UniversalTracker.js';
import { generateCorrelationId } from '../../utils/generateId.js';
import {
  parseTraceparent,
  formatTraceparent,
  generateTraceId,
  generateSpanId,
} from '../../core/CorrelationManager.js';

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
  readonly excludeRoutes?: ReadonlyArray<string | RegExp>;
  readonly captureHeaders?: boolean;
  readonly redactHeaders?: ReadonlyArray<string>;
  readonly propagateTraceparent?: boolean;
}

const DEFAULT_SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
]);

/**
 * Express HTTP request tracking middleware with W3C traceparent context propagation
 * and AsyncLocalStorage boundary isolation.
 */
export function trackflowMiddleware(
  tracker: UniversalTracker,
  options?: ExpressMiddlewareOptions,
) {
  const headerName = (options?.headerName ?? 'x-correlation-id').toLowerCase();
  const recordPerformance = options?.recordPerformance ?? true;
  const recordActivity = options?.recordActivity ?? true;
  const excludeRoutes = options?.excludeRoutes ?? [];
  const captureHeaders = options?.captureHeaders ?? false;
  const propagateTraceparent = options?.propagateTraceparent ?? true;
  const sensitiveHeaders = new Set([
    ...DEFAULT_SENSITIVE_HEADERS,
    ...(options?.redactHeaders?.map((h) => h.toLowerCase()) ?? []),
  ]);

  return function (req: RequestLike, res: ResponseLike, next: NextFunctionLike): void {
    const routePath = req.route?.path || req.path || req.url || 'unknown';

    // Check route exclusions
    const isExcluded = excludeRoutes.some((pattern) => {
      if (typeof pattern === 'string') {
        return routePath === pattern || routePath.startsWith(pattern);
      }
      return pattern.test(routePath);
    });

    if (isExcluded) {
      next();
      return;
    }

    const correlationId =
      (req.headers?.[headerName] as string) || generateCorrelationId();

    if (res.setHeader) {
      res.setHeader(headerName, correlationId);
    }

    // W3C traceparent resolution
    const incomingTraceparent =
      (req.headers?.traceparent as string) || (req.headers?.['trace-parent'] as string);
    const parsedTrace = incomingTraceparent ? parseTraceparent(incomingTraceparent) : null;

    const traceId = parsedTrace ? parsedTrace.traceId : generateTraceId();
    const parentId = parsedTrace ? parsedTrace.parentId : undefined;
    const spanId = generateSpanId();

    if (propagateTraceparent && res.setHeader) {
      res.setHeader('traceparent', formatTraceparent(traceId, spanId));
    }

    const startTime = Date.now();
    const method = req.method || 'GET';
    const operation = `${method} ${routePath}`;
    const userId = req.user?.id || req.userId;

    let sanitizedHeaders: Record<string, unknown> | undefined;
    if (captureHeaders && req.headers) {
      sanitizedHeaders = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (sensitiveHeaders.has(key.toLowerCase())) {
          sanitizedHeaders[key] = '[REDACTED]';
        } else {
          sanitizedHeaders[key] = val;
        }
      }
    }

    tracker.runWithContext(
      {
        correlationId,
        traceId,
        spanId,
        parentId,
        userId,
      },
      () => {
        if (recordActivity) {
          tracker.activities.track('http.request', {
            userId,
            category: 'http',
            metadata: {
              method,
              path: routePath,
              correlationId,
              traceId,
              spanId,
              parentId,
              ...(sanitizedHeaders ? { headers: sanitizedHeaders } : {}),
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
                  traceId,
                  spanId,
                  userId,
                },
              );
            }
          });
        }

        next();
      },
    );
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
