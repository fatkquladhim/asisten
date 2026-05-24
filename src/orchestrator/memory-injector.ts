import type { ParsedIntent, AgentState } from '@/shared/types';
import { logger } from '@/shared/logger';

export class MemoryInjector {
  async retrieve(intent: ParsedIntent): Promise<AgentState['memory']> {
    logger.debug(
      { domain: intent.domain, entities: intent.entities },
      'MemoryInjector.retrieve',
    );

    return { episodic: [], semantic: [] };
  }
}
