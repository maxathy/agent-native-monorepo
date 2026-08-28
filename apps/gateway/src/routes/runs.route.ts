import { Router } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

const AGENT_SERVICE_URL = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:3000';

export const runsRouter = Router();

// Selection is done with `pathFilter`, not an Express mount path. A mount path
// is stripped from req.url before the proxy sees it, so `/runs` would reach the
// agent service as `/` and 404. pathFilter prefix-matches without rewriting,
// which is what makes /runs and /runs/stream arrive intact.
runsRouter.use(
  createProxyMiddleware({
    target: AGENT_SERVICE_URL,
    pathFilter: '/runs',
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward correlation ID
        const correlationId = req.headers['x-correlation-id'];
        if (correlationId) {
          proxyReq.setHeader('x-correlation-id', correlationId as string);
        }
        // express.json() upstream of this router has already consumed the
        // request stream, so the proxied request would never be finalized and
        // the client would hang. Re-serialize the parsed body onto it. Applies
        // to the request only — SSE responses stream through untouched.
        fixRequestBody(proxyReq, req);
      },
    },
  }),
);
