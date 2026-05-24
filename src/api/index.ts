import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '@/shared/logger';
import { createChatRouter } from './routes/chat';
import type { Orchestrator } from '@/orchestrator/index';

export function createApp(orchestrator: Orchestrator): Hono {
  const app = new Hono();

  app.use('*', cors());

  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.debug({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, 'Request');
  });

  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.route('/api/chat', createChatRouter(orchestrator));

  return app;
}
