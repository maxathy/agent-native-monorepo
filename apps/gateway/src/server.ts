import express from 'express';
import { createLogger, initTelemetry } from '@repo/telemetry';
import { correlationIdMiddleware } from './middleware/correlation-id.middleware.js';
import { runsRouter } from './routes/runs.route.js';

initTelemetry('gateway');

const logger = createLogger('gateway');
const app = express();

app.use(express.json());
app.use(correlationIdMiddleware);
app.use(runsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env['GATEWAY_PORT'] ?? 3001;

app.listen(port, () => {
  logger.info({ msg: 'gateway.ready', port });
});

export { app };
