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
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    // Attach to response header for traceability
    const res = context.switchToHttp().getResponse();
    res.setHeader('x-correlation-id', correlationId);

    // Store in request for downstream access
    (req as Request & { correlationId: string }).correlationId = correlationId;

    return new Observable((subscriber) => {
      runWithCorrelationId(correlationId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
