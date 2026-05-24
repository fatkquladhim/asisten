import { env } from '@/config/index';
import { logger } from '@/shared/logger';

const OPENAI_BASE = 'https://api.openai.com/v1';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
}

export class LLMClient {
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = env.OPENAI_API_KEY ?? '';
    this.defaultModel = 'gpt-4o-mini';
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateCompletion(
    systemPrompt: string,
    userPrompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.isConfigured) {
      logger.warn('LLM not configured — returning fallback response');
      return this.fallbackResponse(options.responseFormat);
    }

    const {
      model = this.defaultModel,
      temperature = 0.1,
      maxTokens = 1024,
      responseFormat,
    } = options;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (responseFormat === 'json_object') {
      body['response_format'] = { type: 'json_object' };
    }

    logger.debug({ model, responseFormat, systemPromptLength: systemPrompt.length }, 'LLM request');

    try {
      const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text }, 'LLM API error');
        throw new Error(`LLM API error: ${response.status} ${text}`);
      }

      const data = (await response.json()) as {
        choices: { message: { content: string | null } }[];
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const content = data.choices[0]?.message?.content;

      logger.debug(
        { totalTokens: data.usage?.total_tokens, model },
        'LLM response received',
      );

      return content ?? '';
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'LLM request failed');
      return this.fallbackResponse(responseFormat);
    }
  }

  private fallbackResponse(format?: 'text' | 'json_object'): string {
    if (format === 'json_object') {
      return '{}';
    }
    return '';
  }
}

export const llm = new LLMClient();
