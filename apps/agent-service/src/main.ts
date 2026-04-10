import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { initTelemetry, createLogger } from '@repo/telemetry';
import { RunRequestSchema } from '@repo/agent-contracts';
import { AppModule } from './app.module.js';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe.js';

const logger = createLogger('main');

async function bootstrap(): Promise<void> {
  initTelemetry('agent-service');

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ZodValidationPipe(RunRequestSchema));
  app.enableCors();

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ status: 'ok' });
  });

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);

  logger.info({ msg: 'agent-service.ready', port });
}

bootstrap().catch((err: unknown) => {
  logger.error({ msg: 'agent-service.fatal', error: err });
  process.exit(1);
});
