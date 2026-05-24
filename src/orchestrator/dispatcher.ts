import type { ExecutionStep } from '@/shared/types';
import { logger } from '@/shared/logger';

export class Dispatcher {
  async dispatchAsync(
    agent: ExecutionStep['agent'],
    step: ExecutionStep,
    context: Record<string, unknown>,
  ): Promise<string> {
    logger.debug({ agent, action: step.action }, 'Dispatcher.dispatchAsync');
    return crypto.randomUUID();
  }

  async awaitResult(jobId: string): Promise<unknown> {
    logger.debug({ jobId }, 'Dispatcher.awaitResult');
    return null;
  }
}
