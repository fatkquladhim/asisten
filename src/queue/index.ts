import { Queue } from 'bullmq';
import { env } from '@/config/index';
import { logger } from '@/shared/logger';

const connection = { url: env.REDIS_URL };

export const quantQueue = new Queue('quant', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600 * 24 },
    removeOnFail: { age: 3600 * 24 * 7 },
  },
});

export async function closeQueues(): Promise<void> {
  await quantQueue.close();
  logger.info('BullMQ queues closed');
}
