import { describe, it, expect } from 'vitest';
import {
  redactSensitiveData,
  maskEmail,
  maskPhone,
  maskCreditCard,
} from '../../src/utils/redact.js';
import { safeSerialize, safeParse } from '../../src/utils/safeSerialize.js';
import { createTracker } from '../../src/engines/universal/UniversalTracker.js';

describe('Privacy, Redaction & Security Engine', () => {
  it('should mask emails, phone numbers, and credit cards according to rules', () => {
    expect(maskEmail('john.doe@company.org')).toBe('j***@company.org');
    expect(maskPhone('+1-555-867-5309')).toBe('***-***-5309');
    expect(maskCreditCard('4111-2222-3333-4444')).toBe('****-****-****-4444');
  });

  it('should strip ignoredProperties and redact sensitive fields recursively', () => {
    const rawData = {
      username: 'johndoe',
      password: 'SuperSecretPassword!123',
      tempToken: 'xyz-999-token',
      debugDump: 'verbose log internal state',
      contact: {
        email: 'alice@wonderland.io',
        pin: '1234',
      },
    };

    const redacted = redactSensitiveData(rawData, {
      enabled: true,
      fields: ['tempToken'],
      patterns: [],
      replacement: '[REDACTED]',
      maskEmails: true,
      ignoredProperties: ['debugDump'],
    });

    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.tempToken).toBe('[REDACTED]');
    expect((redacted.contact as Record<string, unknown>).pin).toBe('[REDACTED]');
    expect((redacted.contact as Record<string, unknown>).email).toBe('a***@wonderland.io');
    expect('debugDump' in redacted).toBe(false);
  });

  it('should safely serialize circular objects, BigInts, Maps, and Errors without crashing', () => {
    const cyclicObj: Record<string, unknown> = {
      name: 'root',
      bigNumber: BigInt('9007199254740995'),
      err: new Error('Simulated failure'),
    };
    cyclicObj.self = cyclicObj;

    const serialized = safeSerialize(cyclicObj);
    expect(typeof serialized).toBe('string');
    expect(serialized).toContain('[Circular]');
    expect(serialized).toContain('9007199254740995');
    expect(serialized).toContain('Simulated failure');

    const parsed = safeParse<{ name: string; self: string }>(serialized, { name: '', self: '' });
    expect(parsed.name).toBe('root');
    expect(parsed.self).toBe('[Circular]');
  });

  it('should enforce maximum payload size limit and truncate oversized payloads', async () => {
    const tracker = createTracker({
      appName: 'payload-limit-test',
      redaction: {
        enabled: true,
        fields: [],
        patterns: [],
        replacement: '[REDACTED]',
        maxPayloadSize: 100, // Very small limit for testing
      },
    });

    await tracker.start();

    // Oversized string payload (1,000 characters)
    const largeString = 'A'.repeat(1_000);
    tracker.activities.track('test.largePayload', {
      hugeContent: largeString,
    });

    await tracker.flush();

    const events = await tracker.query();
    expect(events.length).toBe(1);

    const eventData = events[0].data as Record<string, unknown>;
    expect(eventData._truncated).toBe(true);
    expect(eventData.maxAllowed).toBe(100);

    await tracker.stop();
  });
});
