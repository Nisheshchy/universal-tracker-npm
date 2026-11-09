import type { ChangeType } from '../../types/index.js';
import { deepEqual } from '../../utils/deepClone.js';

export interface PropertyDiff {
  readonly property: string;
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly changeType: ChangeType;
}

export interface ComparisonOptions {
  readonly ignoredProperties?: readonly string[];
  readonly maxDepth?: number;
}

export class ObjectComparator {
  private readonly defaultMaxDepth: number;

  constructor(defaultMaxDepth: number = 30) {
    this.defaultMaxDepth = defaultMaxDepth;
  }

  /**
   * Compare two objects and produce an array of property diffs.
   */
  compare(
    before: unknown,
    after: unknown,
    options?: ComparisonOptions,
  ): PropertyDiff[] {
    const diffs: PropertyDiff[] = [];
    const ignored = new Set(options?.ignoredProperties ?? []);
    const maxDepth = options?.maxDepth ?? this.defaultMaxDepth;

    this.walkDiff(before, after, '', diffs, ignored, 0, maxDepth);
    return diffs;
  }

  /**
   * Generate a structured JSON diff object categorised by added, updated, and deleted keys.
   */
  jsonDiff(
    before: unknown,
    after: unknown,
    options?: ComparisonOptions,
  ): {
    added: Record<string, unknown>;
    updated: Record<string, { before: unknown; after: unknown }>;
    deleted: Record<string, unknown>;
  } {
    const diffs = this.compare(before, after, options);
    const added: Record<string, unknown> = {};
    const updated: Record<string, { before: unknown; after: unknown }> = {};
    const deleted: Record<string, unknown> = {};

    for (const d of diffs) {
      if (d.changeType === 'added') {
        added[d.path] = d.after;
      } else if (d.changeType === 'updated') {
        updated[d.path] = { before: d.before, after: d.after };
      } else if (d.changeType === 'deleted') {
        deleted[d.path] = d.before;
      }
    }

    return { added, updated, deleted };
  }

  /**
   * Generate a formatted JSON diff string.
   */
  generateDiff(
    before: unknown,
    after: unknown,
    options?: ComparisonOptions & { pretty?: boolean },
  ): string {
    const diff = this.jsonDiff(before, after, options);
    return JSON.stringify(diff, null, options?.pretty !== false ? 2 : undefined);
  }

  private walkDiff(
    before: unknown,
    after: unknown,
    currentPath: string,
    diffs: PropertyDiff[],
    ignored: Set<string>,
    depth: number,
    maxDepth: number,
  ): void {
    if (depth >= maxDepth) return;
    if (deepEqual(before, after)) return;

    // If either is not an object or is null/undefined or one is array and other isn't
    if (
      before === null ||
      after === null ||
      before === undefined ||
      after === undefined ||
      typeof before !== 'object' ||
      typeof after !== 'object' ||
      Array.isArray(before) !== Array.isArray(after)
    ) {
      if (currentPath) {
        const propName = currentPath.split('.').pop() ?? currentPath;
        if (!ignored.has(propName)) {
          diffs.push({
            property: propName,
            path: currentPath,
            before,
            after,
            changeType: before === undefined ? 'added' : after === undefined ? 'deleted' : 'updated',
          });
        }
      }
      return;
    }

    // Both are arrays
    if (Array.isArray(before) && Array.isArray(after)) {
      const maxLen = Math.max(before.length, after.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
        const itemProp = `[${i}]`;
        if (ignored.has(itemProp)) continue;

        if (i >= before.length) {
          diffs.push({
            property: itemProp,
            path: itemPath,
            before: undefined,
            after: after[i],
            changeType: 'added',
          });
        } else if (i >= after.length) {
          diffs.push({
            property: itemProp,
            path: itemPath,
            before: before[i],
            after: undefined,
            changeType: 'deleted',
          });
        } else if (!deepEqual(before[i], after[i])) {
          if (
            typeof before[i] === 'object' &&
            before[i] !== null &&
            typeof after[i] === 'object' &&
            after[i] !== null
          ) {
            this.walkDiff(before[i], after[i], itemPath, diffs, ignored, depth + 1, maxDepth);
          } else {
            diffs.push({
              property: itemProp,
              path: itemPath,
              before: before[i],
              after: after[i],
              changeType: 'updated',
            });
          }
        }
      }
      return;
    }

    // Both are objects
    const beforeObj = before as Record<string, unknown>;
    const afterObj = after as Record<string, unknown>;

    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

    for (const key of allKeys) {
      if (ignored.has(key)) continue;

      const propPath = currentPath ? `${currentPath}.${key}` : key;
      const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);

      if (!hasBefore && hasAfter) {
        diffs.push({
          property: key,
          path: propPath,
          before: undefined,
          after: afterObj[key],
          changeType: 'added',
        });
      } else if (hasBefore && !hasAfter) {
        diffs.push({
          property: key,
          path: propPath,
          before: beforeObj[key],
          after: undefined,
          changeType: 'deleted',
        });
      } else {
        const valBefore = beforeObj[key];
        const valAfter = afterObj[key];

        if (!deepEqual(valBefore, valAfter)) {
          if (
            typeof valBefore === 'object' &&
            valBefore !== null &&
            typeof valAfter === 'object' &&
            valAfter !== null &&
            !(valBefore instanceof Date) &&
            !(valAfter instanceof Date)
          ) {
            this.walkDiff(valBefore, valAfter, propPath, diffs, ignored, depth + 1, maxDepth);
          } else {
            diffs.push({
              property: key,
              path: propPath,
              before: valBefore,
              after: valAfter,
              changeType: 'updated',
            });
          }
        }
      }
    }
  }
}

