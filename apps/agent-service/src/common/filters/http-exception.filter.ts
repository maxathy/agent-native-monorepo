import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { createLogger, getCorrelationId } from '@repo/telemetry';

const logger = createLogger('http-exception');

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal Server Error';

    const correlationId = getCorrelationId() ?? (req as Request & { correlationId?: string }).correlationId;

    const body = {
      statusCode: status,
      error: status >= 500 ? 'Internal Server Error' : 'Bad Request',
      message,
      correlationId,
    };

    logger.error({ msg: 'unhandled.exception', ...body, stack: exception instanceof Error ? exception.stack : undefined });

    res.status(status).json(body);
  }
}
