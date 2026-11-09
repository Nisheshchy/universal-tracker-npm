/**
 * Sensitive-data redaction utilities.
 *
 * Recursively walks an object graph and replaces values whose keys match
 * known-sensitive field names or caller-supplied regex patterns.
 */

import type { RedactionConfig } from '../types/config';

/**
 * Default field names treated as sensitive regardless of user config.
 *
 * The comparison is performed case-insensitively so `Password`, `PASSWORD`,
 * and `password` all match.
 */
const DEFAULT_SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'authorization',
  'cookie',
  'ssn',
  'creditcard',
]);

/** Safety limit to prevent infinite recursion on cyclic structures. */
const MAX_REDACTION_DEPTH = 50;

/**
 * Return `true` when `fieldName` (lowercased) matches a sensitive field or
 * any of the configured regex patterns.
 */
function isSensitiveField(
  fieldName: string,
  sensitiveFields: ReadonlySet<string>,
  patterns: ReadonlyArray<RegExp>,
): boolean {
  const lower = fieldName.toLowerCase();

  if (sensitiveFields.has(lower)) {
    return true;
  }

  for (const pattern of patterns) {
    // Reset lastIndex for sticky / global regexps.
    pattern.lastIndex = 0;
    if (pattern.test(fieldName)) {
      return true;
    }
  }

  return false;
}

/**
 * Internal recursive redaction worker.
 */
function redactObject(
  data: Record<string, unknown>,
  sensitiveFields: ReadonlySet<string>,
  patterns: ReadonlyArray<RegExp>,
  replacement: string,
  depth: number,
): Record<string, unknown> {
  if (depth >= MAX_REDACTION_DEPTH) {
    return data;
  }

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(data)) {
    const value = data[key];

    if (isSensitiveField(key, sensitiveFields, patterns)) {
      result[key] = replacement;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          return redactObject(
            item as Record<string, unknown>,
            sensitiveFields,
            patterns,
            replacement,
            depth + 1,
          );
        }
        return item;
      });
      continue;
    }

    if (value !== null && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
      result[key] = redactObject(
        value as Record<string, unknown>,
        sensitiveFields,
        patterns,
        replacement,
        depth + 1,
      );
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Redact sensitive fields from a data object according to the supplied
 * {@link RedactionConfig}.
 *
 * If redaction is disabled (`config.enabled === false`) the original object
 * is returned unmodified.
 *
 * @param data   - The object to redact. Not mutated; a new object is returned.
 * @param config - Redaction rules.
 * @returns A shallow-to-deep copy of `data` with sensitive values replaced.
 */
export function redactSensitiveData(
  data: Record<string, unknown>,
  config: RedactionConfig,
): Record<string, unknown> {
  if (!config.enabled) {
    return data;
  }

  // Merge caller-supplied fields with the built-in defaults (all lowercased).
  const sensitiveFields = new Set<string>(DEFAULT_SENSITIVE_FIELDS);
  for (const field of config.fields) {
    sensitiveFields.add(field.toLowerCase());
  }

  return redactObject(
    data,
    sensitiveFields,
    config.patterns,
    config.replacement,
    0,
  );
}
