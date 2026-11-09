# Privacy, Redaction & Security Engine

TrackFlow is built privacy-first. By default, sensitive user credentials, auth tokens, and request bodies are never automatically captured without explicit developer intent.

## Configuration Options

```typescript
import { createTracker } from 'trackflow';

const tracker = createTracker({
  appName: 'my-secure-service',
  environment: 'production',
  redaction: {
    enabled: true,
    // Sensitive field names (case-insensitive)
    fields: ['customToken', 'accountNumber'],
    // Regex patterns for sensitive keys
    patterns: [/secret/i, /api_?key/i],
    // Replacement string
    replacement: '[REDACTED]',
    // Pattern-based masking
    maskEmails: true,       // john.doe@domain.com -> j***@domain.com
    maskPhones: true,       // +1-555-123-4567     -> ***-***-4567
    maskCreditCards: true,  // 4111 2222 3333 4444 -> ****-****-****-4444
    // Maximum data payload size in bytes (protects memory against large dumps)
    maxPayloadSize: 64_000,
    // Completely strip properties from event payloads
    ignoredProperties: ['internalDebugStack', 'rawSocketBuffer'],
  },
  retention: {
    enabled: true,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days TTL
    cleanupIntervalMs: 3_600_000,        // Hourly sweep
  },
});
```

## Built-In Default Sensitive Fields

Regardless of user configuration, TrackFlow matches the following field names case-insensitively and redacts them:
- `password`, `passwd`
- `secret`
- `token`, `jwt`, `bearer`
- `apikey`, `api_key`
- `authorization`
- `cookie`
- `ssn`
- `creditcard`, `credit_card`, `cvv`, `cvc`
- `privatekey`, `private_key`
- `pin`

## Safe Serialization (`safeSerialize`)

TrackFlow includes a hardened JSON serialization engine that eliminates runtime crashes from:
- **Circular References**: Replaces cyclical object references with `[Circular]`.
- **BigInt Literals**: Serializes `BigInt` (e.g. `100n` -> `"100"`).
- **Non-Serializable Objects**: Safely converts `Map` to key-value objects, `Set` to arrays, and `Error` to structured error records.
- **Unserializable Types**: Omits functions and symbols without crashing.

## Memory & Payload DOS Protection

Large object dumps can exhaust application memory. When `maxPayloadSize` is configured, payloads exceeding the byte limit are safely replaced with a truncated preview indicator:
```json
{
  "_truncated": true,
  "originalSize": 150000,
  "maxAllowed": 64000,
  "preview": "{ ... first 200 bytes ... }...",
  "message": "Payload exceeded max size limit of 64000 bytes."
}
```

## Automatic Data Retention (`RetentionManager`)

When `retention.enabled` is `true`, a background task runs periodically to enforce time-to-live (TTL) policies and prevent unbounded disk or memory growth.
