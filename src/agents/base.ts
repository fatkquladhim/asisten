import type { ExecutionStep } from '@/shared/types';

export abstract class AgentBase {
  abstract execute(
    step: ExecutionStep,
    context: Record<string, unknown>,
  ): Promise<unknown>;
}
