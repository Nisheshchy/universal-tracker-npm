/**
 * Sensitive-data redaction utilities.
 *
 * Recursively walks an object graph and replaces values whose keys match
 * known-sensitive field names or caller-supplied regex patterns.
 * Also supports pattern-based masking for emails, phone numbers, and
 * credit cards, as well as property stripping.
 */

import type { RedactionConfig } from '../types/config.js';

/**
 * Default field names treated as sensitive regardless of user config.
 *
 * The comparison is performed case-insensitively so `Password`, `PASSWORD`,
 * and `password` all match.
 */
const DEFAULT_SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'ssn',
  'creditcard',
  'credit_card',
  'cvv',
  'cvc',
  'privatekey',
  'private_key',
  'pin',
  'jwt',
  'bearer',
]);

/** Safety limit to prevent infinite recursion on cyclic structures. */
const MAX_REDACTION_DEPTH = 50;

/** Regular expressions for pattern-based masking. */
const EMAIL_REGEX = /\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?(\d{4})\b/g;
const CC_REGEX = /\b(?:\d{4}[-\s]?){3}(\d{4})\b/g;

/**
 * Mask an email address to protect privacy (e.g. `j***@example.com`).
 */
export function maskEmail(email: string): string {
  return email.replace(EMAIL_REGEX, '$1***@$2');
}

/**
 * Mask a phone number (e.g. `***-***-1234`).
 */
export function maskPhone(phone: string): string {
  return phone.replace(PHONE_REGEX, '***-***-$1');
}

/**
 * Mask a credit card number (e.g. `****-****-****-1234`).
 */
export function maskCreditCard(cc: string): string {
  return cc.replace(CC_REGEX, '****-****-****-$1');
}

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
    pattern.lastIndex = 0;
    if (pattern.test(fieldName)) {
      return true;
    }
  }

  return false;
}

/**
 * Mask string values according to configured mask flags.
 */
function maskStringValue(
  value: string,
  config: RedactionConfig,
): string {
  let result = value;
  if (config.maskEmails) {
    result = maskEmail(result);
  }
  if (config.maskPhones) {
    result = maskPhone(result);
  }
  if (config.maskCreditCards) {
    result = maskCreditCard(result);
  }
  return result;
}

/**
 * Internal recursive redaction worker.
 */
function redactObject(
  data: Record<string, unknown>,
  sensitiveFields: ReadonlySet<string>,
  patterns: ReadonlyArray<RegExp>,
  replacement: string,
  config: RedactionConfig,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (depth >= MAX_REDACTION_DEPTH) {
    return data;
  }

  if (seen.has(data)) {
    return { _ref: '[Circular]' };
  }
  seen.add(data);

  const ignoredSet = config.ignoredProperties
    ? new Set(config.ignoredProperties.map((p) => p.toLowerCase()))
    : null;

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(data)) {
    const lowerKey = key.toLowerCase();

    // Strip ignored properties entirely
    if (ignoredSet && ignoredSet.has(lowerKey)) {
      continue;
    }

    const value = data[key];

    if (isSensitiveField(key, sensitiveFields, patterns)) {
      result[key] = replacement;
      continue;
    }

    if (typeof value === 'string') {
      result[key] = maskStringValue(value, config);
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          return maskStringValue(item, config);
        }
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          return redactObject(
            item as Record<string, unknown>,
            sensitiveFields,
            patterns,
            replacement,
            config,
            depth + 1,
            seen,
          );
        }
        return item;
      });
      continue;
    }

    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !(value instanceof RegExp)
    ) {
      result[key] = redactObject(
        value as Record<string, unknown>,
        sensitiveFields,
        patterns,
        replacement,
        config,
        depth + 1,
        seen,
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

  const seen = new WeakSet<object>();

  return redactObject(
    data,
    sensitiveFields,
    config.patterns,
    config.replacement,
    config,
    0,
    seen,
  );
}
