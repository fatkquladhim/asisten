import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '@/shared/logger';
import { createChatRouter } from './routes/chat';
import type { Orchestrator } from '@/orchestrator/index';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createApp(orchestrator: Orchestrator): Hono {
  const app = new Hono();

  app.use('*', cors());

  // Serve dashboard at /
  const dashboardPath = join(process.cwd(), 'public', 'index.html');
  app.get('/', async (c) => {
    const html = readFileSync(dashboardPath, 'utf-8');
    return c.html(html);
  });

  app.get('/dashboard', async (c) => {
    const html = readFileSync(dashboardPath, 'utf-8');
    return c.html(html);
  });

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
