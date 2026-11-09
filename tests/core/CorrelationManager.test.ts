import { describe, it, expect } from 'vitest';
import { CorrelationManager } from '../../src/core/CorrelationManager.js';

describe('Core: CorrelationManager', () => {
  it('should auto-generate and manage correlation IDs', () => {
    const cm = new CorrelationManager();
    const id1 = cm.getCorrelationId();

    expect(id1).toBeDefined();
    expect(typeof id1).toBe('string');
    expect(cm.getCorrelationId()).toBe(id1);

    cm.setCorrelationId('req_custom_123');
    expect(cm.getCorrelationId()).toBe('req_custom_123');
  });

  it('should manage userId and sessionId contexts', () => {
    const cm = new CorrelationManager();

    cm.setUserId('user_456');
    cm.setSessionId('sess_789');

    expect(cm.getUserId()).toBe('user_456');
    expect(cm.getSessionId()).toBe('sess_789');

    const context = cm.createContext();
    expect(context).toEqual({
      correlationId: expect.any(String),
      userId: 'user_456',
      sessionId: 'sess_789',
    });

    cm.reset();
    expect(cm.getUserId()).toBeUndefined();
    expect(cm.getSessionId()).toBeUndefined();
  });
});

