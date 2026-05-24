import type { ParsedIntent } from '@/shared/types';
import type { LLMClient } from '@/shared/llm';
import { logger } from '@/shared/logger';

const SYSTEM_PROMPT = `You are a semantic router for a multi-agent AI system.
Analyze the user's message and extract their intent into a strict JSON object.

Available agents:
- "quant" — cryptocurrency trading, market data, technical analysis, backtesting, portfolio, finance
- "erp" — IoT telemetry, resource management, inventory, organizational hierarchy
- "cyber" — OSINT, security research, vulnerability analysis, network scanning
- "lifestyle" — health tracking, habit formation, news aggregation, daily briefs

Respond ONLY with a JSON object matching this exact structure:
{
  "domain": "quant | erp | cyber | lifestyle | general",
  "action": "a concise verb describing what to do",
  "entities": ["list", "of", "relevant", "entities", "or", "symbols"]
}`;

export class SemanticRouter {
  constructor(private llm: LLMClient) {}

  async classify(input: string, _summary?: string): Promise<ParsedIntent> {
    logger.debug({ inputLength: input.length }, 'SemanticRouter.classify');

    if (!this.llm.isConfigured) {
      logger.warn('LLM not configured — returning default intent');
      return { domain: 'general', action: 'respond', entities: [] };
    }

    const raw = await this.llm.generateCompletion(SYSTEM_PROMPT, input, {
      responseFormat: 'json_object',
      temperature: 0.1,
    });

    try {
      const parsed = JSON.parse(raw) as Partial<ParsedIntent>;
      const intent: ParsedIntent = {
        domain: parsed.domain ?? 'general',
        action: parsed.action ?? 'respond',
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      };
      logger.debug({ intent }, 'Intent classified');
      return intent;
    } catch {
      logger.warn({ raw }, 'Failed to parse LLM intent JSON — using default');
      return { domain: 'general', action: 'respond', entities: [] };
    }
  }
}
