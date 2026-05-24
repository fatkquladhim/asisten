import type { ExecutionStep } from '@/shared/types';
import { addQuantJob, waitForJob } from '@/queue/job-tracker';
import { logger } from '@/shared/logger';

export class Dispatcher {
  async dispatchAsync(
    agent: ExecutionStep['agent'],
    step: ExecutionStep,
    _context: Record<string, unknown>,
  ): Promise<string> {
    logger.debug({ agent, action: step.action }, 'Dispatcher.dispatchAsync');

    const jobId = await addQuantJob(step.action, step.params as Record<string, unknown>);
    return jobId;
  }

  async awaitResult(jobId: string): Promise<unknown> {
    logger.debug({ jobId }, 'Dispatcher.awaitResult');
    return waitForJob(jobId, 60000);
  }
}
