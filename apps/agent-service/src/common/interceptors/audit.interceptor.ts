import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import { createLogger } from '@repo/telemetry';

const logger = createLogger('audit');

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap((data: Record<string, unknown> | undefined) => {
        logger.info({
          msg: 'run.complete',
          runId: data?.['runId'],
          sessionId: (req.body as Record<string, unknown>)?.['sessionId'],
          durationMs: Date.now() - start,
          promptTokens: (data?.['tokenCounts'] as Record<string, number> | undefined)?.['prompt'],
          completionTokens: (data?.['tokenCounts'] as Record<string, number> | undefined)?.['completion'],
          outcome: data?.['outcome'],
        });
      }),
    );
  }
}
