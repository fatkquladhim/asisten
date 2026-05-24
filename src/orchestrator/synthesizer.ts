import type { AgentState, ChatMessage } from '@/shared/types';
import { logger } from '@/shared/logger';

export class Synthesizer {
  async summarize(state: AgentState): Promise<ChatMessage> {
    logger.debug(
      { errors: state.errors.length, planSteps: state.plan.length },
      'Synthesizer.summarize',
    );

    return {
      role: 'assistant',
      content: 'No response generated — all agents returned empty results.',
    };
  }
}
