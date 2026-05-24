import type { ParsedIntent, ExecutionStep, AgentState } from '@/shared/types';
import { logger } from '@/shared/logger';

export class Planner {
  async decompose(
    intent: ParsedIntent,
    memory: AgentState['memory'],
    context: Record<string, unknown>,
  ): Promise<ExecutionStep[]> {
    logger.debug(
      { domain: intent.domain, action: intent.action },
      'Planner.decompose',
    );

    return [];
  }
}
