import { randomUUID } from 'node:crypto';
import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithCorrelationId } from '@repo/telemetry';
import type { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    // Attach to response header for traceability
    const res = context.switchToHttp().getResponse();
    res.setHeader('x-correlation-id', correlationId);

    // Write the minted id back onto the request headers, mirroring
    // apps/gateway/src/middleware/correlation-id.middleware.ts. Without this
    // line `@Headers('x-correlation-id')` in RunsController binds undefined on
    // a request that omitted the header, seedWorkingMemory's Zod parse throws,
    // and POST /runs answers 500 — while a perfectly good id sits on the same
    // request. Direct callers of port 3000 hit that; the README quickstart
    // does not, only because it goes through the gateway.
    //
    // Minting here rather than defaulting at the call site is deliberate: a
    // second randomUUID() downstream would disagree with the id already in the
    // response header, this log line and the AsyncLocalStorage context. One
    // request, one id.
    req.headers['x-correlation-id'] = correlationId;

    // Store in request for downstream access
    (req as Request & { correlationId: string }).correlationId = correlationId;

    return new Observable((subscriber) => {
      runWithCorrelationId(correlationId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
