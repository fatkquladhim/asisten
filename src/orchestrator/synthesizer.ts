import type { AgentState, ChatMessage } from '@/shared/types';
import type { LLMClient } from '@/shared/llm';
import { logger } from '@/shared/logger';

const SYSTEM_PROMPT = `You are a response synthesizer for an AI operating system.
Given the original user message, the execution plan, and the results from each agent,
write a clear, natural-language summary of what happened.

Include specific numbers, prices, and statuses from the results.
If any step failed, mention the failure politely.
Keep the response concise (2-4 sentences) but informative.`;

export class Synthesizer {
  constructor(private llm: LLMClient) {}

  async summarize(state: AgentState): Promise<ChatMessage> {
    logger.debug(
      { errors: state.errors.length, planSteps: state.plan.length },
      'Synthesizer.summarize',
    );

    const userMessage = state.messages.find((m) => m.role === 'user');
    const agentResults = state.context['agentResults'];
    const errors = state.errors;

    if (!this.llm.isConfigured) {
      logger.warn('LLM not configured — using fallback synthesis');
      return this.fallback(userMessage?.content);
    }

    const userPrompt = [
      `## Original message`,
      userMessage?.content ?? '(no message)',
      '',
      `## Plan (${state.plan.length} steps)`,
      JSON.stringify(state.plan, null, 2),
      '',
      `## Results`,
      JSON.stringify(agentResults, null, 2),
      '',
      errors.length > 0
        ? `## Errors (${errors.length})` + '\n' + JSON.stringify(errors, null, 2)
        : '## No errors',
      '',
      'Write a friendly summary of what happened.',
    ].join('\n');

    const raw = await this.llm.generateCompletion(SYSTEM_PROMPT, userPrompt, {
      temperature: 0.3,
      maxTokens: 512,
    });

    const content = raw.trim() || this.fallback(userMessage?.content).content;

    return { role: 'assistant', content };
  }

  private fallback(userMessage?: string): ChatMessage {
    const content = userMessage
      ? `Processed your request: "${userMessage.slice(0, 60)}..."`
      : 'No response generated — all agents returned empty results.';
    return { role: 'assistant', content };
  }
}
