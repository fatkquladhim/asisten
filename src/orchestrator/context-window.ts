import type { AgentState } from '@/shared/types';
import { logger } from '@/shared/logger';

export class ContextWindow {
  async optimize(state: AgentState): Promise<{ messages: AgentState['messages']; summary?: string }> {
    logger.debug(
      { messageCount: state.messages.length },
      'ContextWindow.optimize',
    );

    return {
      messages: state.messages,
      summary: state.summary,
    };
  }
}
