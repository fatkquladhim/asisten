import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Orchestrator } from '@/orchestrator/index';
import { logger } from '@/shared/logger';

const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  userId: z.string().min(1).max(255),
});

export function createChatRouter(orchestrator: Orchestrator): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', chatSchema), async (c) => {
    const { message, userId } = c.req.valid('json');

    logger.info({ userId, messageLength: message.length }, 'Chat request received');

    const response = await orchestrator.run(message, userId, 'chat');

    return c.json({ response });
  });

  return router;
}
