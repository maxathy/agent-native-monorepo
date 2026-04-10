import { describe, it, expect } from 'vitest';
import { runWithCorrelationId, getCorrelationId, createLogger } from './logger.js';

describe('runWithCorrelationId', () => {
  it('makes correlation ID available within the callback', () => {
    runWithCorrelationId('test-123', () => {
      expect(getCorrelationId()).toBe('test-123');
    });
  });

  it('returns undefined outside a correlation context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('supports nested contexts', () => {
    runWithCorrelationId('outer', () => {
      expect(getCorrelationId()).toBe('outer');
      runWithCorrelationId('inner', () => {
        expect(getCorrelationId()).toBe('inner');
      });
      expect(getCorrelationId()).toBe('outer');
    });
  });
});

describe('createLogger', () => {
  it('returns a pino logger instance', () => {
    const logger = createLogger('test');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
