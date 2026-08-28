import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type Logger } from 'pino';

interface LogContext {
  correlationId?: string;
}

const als = new AsyncLocalStorage<LogContext>();

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return als.run({ correlationId }, fn);
}

export function getCorrelationId(): string | undefined {
  return als.getStore()?.correlationId;
}

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env['LOG_LEVEL'] ?? 'info',
    // Without this an Error logged as `{ error: err }` serializes to `{}`, because
    // message and stack are non-enumerable. A container dying with `"error":{}` in
    // its last log line is unreadable, which is the opposite of the point.
    serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
    mixin() {
      const store = als.getStore();
      return store?.correlationId ? { correlationId: store.correlationId } : {};
    },
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino/file', options: { destination: 1 } }
        : undefined,
  });
}
