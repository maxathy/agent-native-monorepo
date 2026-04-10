import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const AGENT_SERVICE_URL = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:3000';

export const runsRouter = Router();

runsRouter.use(
  '/runs',
  createProxyMiddleware({
    target: AGENT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/runs': '/runs' },
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward correlation ID
        const correlationId = req.headers['x-correlation-id'];
        if (correlationId) {
          proxyReq.setHeader('x-correlation-id', correlationId as string);
        }
      },
    },
  }),
);
