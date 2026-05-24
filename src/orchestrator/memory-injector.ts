import type { ParsedIntent, AgentState } from '@/shared/types';
import type { LLMClient } from '@/shared/llm';
import { logger } from '@/shared/logger';

export class MemoryInjector {
  constructor(private llm: LLMClient) {}

  async retrieve(_intent: ParsedIntent): Promise<AgentState['memory']> {
    logger.debug('MemoryInjector.retrieve — pgvector query not yet wired');

    return { episodic: [], semantic: [] };
  }
}
