import { Worker } from 'bullmq';
import { env } from '@/config/index';
import { IndodaxClient } from '@/agents/quant/tools/indodax-api';
import { TradeExecutor } from '@/agents/quant/tools/trade-executor';
import { logger } from '@/shared/logger';

const connection = { url: env.REDIS_URL };

const indodaxClient = new IndodaxClient();
const tradeExecutor = new TradeExecutor(indodaxClient);

export const quantWorker = new Worker(
  'quant',
  async (job) => {
    logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Quant worker processing job');

    switch (job.name) {
      case 'run_backtest': {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return { status: 'ok', message: 'Backtest simulation complete' };
      }

      case 'execute_private_trade': {
        const result = await tradeExecutor.executeTrade(job.data);
        return result;
      }

      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 1000,
    },
  },
);

quantWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'Quant worker job completed');
});

quantWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, name: job?.name, error: err.message }, 'Quant worker job failed');
});

export async function closeWorkers(): Promise<void> {
  await quantWorker.close();
  logger.info('BullMQ workers closed');
}
