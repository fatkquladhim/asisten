import type { AgentState } from '@/shared/types';
import type { LLMClient } from '@/shared/llm';
import { logger } from '@/shared/logger';

const MAX_HISTORY_TOKENS = 4000;

export class ContextWindow {
  constructor(private llm: LLMClient) {}

  async optimize(
    state: AgentState,
  ): Promise<{ messages: AgentState['messages']; summary?: string }> {
    const messages = state.messages;
    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);

    if (totalLength <= MAX_HISTORY_TOKENS) {
      return { messages, summary: state.summary };
    }

    logger.info(
      { totalChars: totalLength, messageCount: messages.length },
      'Context window exceeded — summarizing older messages',
    );

    const olderMessages = messages.slice(0, -2);
    const lastMessages = messages.slice(-2);

    if (olderMessages.length === 0 || !this.llm.isConfigured) {
      return { messages: lastMessages, summary: state.summary };
    }

    const olderText = olderMessages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    const prompt = [
      'Summarize the following conversation so that all important context is preserved.',
      'Focus on: user goals, data already fetched, actions taken, and any errors.',
      '',
      olderText,
    ].join('\n');

    const summary = await this.llm.generateCompletion(
      'You are a conversation summarizer. Return a concise summary (2-3 sentences).',
      prompt,
      { temperature: 0.2, maxTokens: 256 },
    );

    logger.info({ summaryLength: summary.length }, 'Context summary generated');

    return {
      messages: lastMessages,
      summary: summary || state.summary,
    };
  }
}
