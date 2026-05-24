import { quantQueue } from './index';
import { logger } from '@/shared/logger';

export async function addQuantJob(
  name: string,
  data: Record<string, unknown>,
): Promise<string> {
  const job = await quantQueue.add(name, data);
  logger.info({ jobId: job.id, name }, 'Quant job added');
  return job.id ?? '';
}

export async function waitForJob(
  jobId: string,
  timeoutMs = 30000,
): Promise<unknown> {
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeoutMs) {
    const job = await quantQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();

    if (state === 'completed') {
      return job.returnvalue;
    }

    if (state === 'failed') {
      throw new Error(`Job ${jobId} failed: ${job.failedReason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
}
