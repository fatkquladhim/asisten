import { env } from '@/config/index';
import { logger } from '@/shared/logger';
import { getPool, closeDb } from '@/config/database';
import { quantQueue, closeQueues } from '@/queue/index';
import { quantWorker, closeWorkers } from '@/queue/workers';
import { LLMClient } from '@/shared/llm';
import { IndodaxClient } from '@/agents/quant/tools/indodax-api';
import { QuantAgent } from '@/agents/quant/index';
import { AgentRegistry } from '@/agents/registry';
import { SemanticRouter } from '@/orchestrator/semantic-router';
import { Planner } from '@/orchestrator/planner';
import { ContextWindow } from '@/orchestrator/context-window';
import { MemoryInjector } from '@/orchestrator/memory-injector';
import { Dispatcher } from '@/orchestrator/dispatcher';
import { Synthesizer } from '@/orchestrator/synthesizer';
import { Orchestrator } from '@/orchestrator/index';
import { createApp } from '@/api/index';
import { serve } from '@hono/node-server';

async function main(): Promise<void> {
  logger.info('Starting Asisten — Personal AI Operating System');

  const pool = getPool();
  const dbClient = await pool.connect();
  dbClient.release();
  logger.info('Database connection verified');

  const llm = new LLMClient();
  if (llm.isConfigured) {
    logger.info('LLM client configured');
  } else {
    logger.warn('OPENAI_API_KEY not set — LLM features disabled');
  }

  const indodax = new IndodaxClient();
  if (indodax.isConfigured) {
    logger.info('Indodax client configured with API keys');
  } else {
    logger.warn('Indodax API keys not configured — trade execution disabled');
  }

  const registry = new AgentRegistry();
  registry.register('quant', new QuantAgent(indodax));

  const orchestrator = new Orchestrator(
    new SemanticRouter(llm),
    new Planner(llm),
    new ContextWindow(llm),
    new MemoryInjector(llm),
    new Dispatcher(),
    new Synthesizer(llm),
    registry,
  );

  const app = createApp(orchestrator);

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      logger.info({ port: info.port }, 'Hono server started');
    },
  );

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    server.close();
    await closeWorkers();
    await closeQueues();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ error: (err as Error).message }, 'Fatal startup error');
  process.exit(1);
});
