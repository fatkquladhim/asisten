import type { ParsedIntent, ExecutionStep, AgentState } from '@/shared/types';
import type { LLMClient } from '@/shared/llm';
import { logger } from '@/shared/logger';

const SYSTEM_PROMPT = `You are a task planner for a multi-agent AI operating system.
Given the user's intent and any relevant context, generate a plan as an array of execution steps.

Each step must be a JSON object with these exact fields:
- "id": unique string like "step_1", "step_2"
- "agent": one of "quant", "erp", "cyber", "lifestyle"
- "action": a verb describing what tool to call (e.g. "get_price", "get_ohlcv", "execute_trade")
- "params": an object with the parameters for the action
- "dependsOn": array of step IDs that must complete before this step (empty array for independent steps)
- "async": boolean — true if this is a long-running task (backtesting, scanning, research)
- "fallbackAction": optional string — an alternative action if this step fails

Rules:
1. Steps with empty dependsOn can run in parallel.
2. Steps that depend on others must wait for their dependencies.
3. For multi-step workflows, chain steps logically.
4. If the intent is simple (e.g., "check price"), return a single step.
5. Always include the relevant entity/symbol in params.

Respond ONLY with a JSON object containing a "steps" array. Example:
{
  "steps": [
    { "id": "step_1", "agent": "quant", "action": "get_price", "params": { "pair": "btcidr" }, "dependsOn": [], "async": false }
  ]
}`;

export class Planner {
  constructor(private llm: LLMClient) {}

  async decompose(
    intent: ParsedIntent,
    _memory: AgentState['memory'],
    _context: Record<string, unknown>,
  ): Promise<ExecutionStep[]> {
    logger.debug(
      { domain: intent.domain, action: intent.action },
      'Planner.decompose',
    );

    if (!this.llm.isConfigured) {
      logger.warn('LLM not configured — returning empty plan');
      return [];
    }

    const userPrompt = [
      `Intent domain: ${intent.domain}`,
      `Intent action: ${intent.action}`,
      `Entities: ${intent.entities.join(', ')}`,
      '',
      'Generate an execution plan for this intent.',
    ].join('\n');

    const raw = await this.llm.generateCompletion(SYSTEM_PROMPT, userPrompt, {
      responseFormat: 'json_object',
      temperature: 0.2,
    });

    try {
      const parsed = JSON.parse(raw) as { steps?: Partial<ExecutionStep>[] };

      if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        logger.warn({ raw }, 'Planner returned empty steps');
        return [];
      }

      // Phase 1 fix: Validate actions against whitelist (prevents "unknown action" errors)
      const VALID_QUANT_ACTIONS = new Set([
        'get_price', 'get_ticker', 'get_ohlcv', 'get_historical_data',
        'get_depth', 'get_all_pairs', 'get_all_tickers', 'get_info',
        'open_orders', 'cancel_order', 'execute_trade',
        'analyze_trend', 'analyze_smc', 'analyze_orderbook',
        'calculate_targets', 'get_narrative_insight', 'get_narrative_report',
        'detect_whale', 'analyze_meme_rotation', 'scan_sniper_entry',
        'check_emergency', 'get_macro_regime', 'check_kill_switch',
        'validate_execution', 'validate_trade_size', 'validate_correlation',
        'calculate_position_size', 'record_trade_result',
        'calculate_exit_plan', 'monitor_position',
        'paper_open', 'paper_close', 'paper_monitor', 'get_open_positions', 'get_performance',
        'calculate_position_sizing', 'calculate_reinvest', 'scan_market',
        'analyze_with_ai', 'analyze_with_ai_consensus',
        'score_opportunity',
      ]);

      const steps: ExecutionStep[] = parsed.steps
        .map((s, i) => {
          const action = s.action ?? 'unknown';
          const agent = (['quant', 'erp', 'cyber', 'lifestyle'].includes(s.agent ?? '')
            ? s.agent!
            : 'quant') as ExecutionStep['agent'];

          // Filter out unknown quant actions with warning
          if (agent === 'quant' && !VALID_QUANT_ACTIONS.has(action)) {
            logger.warn({ action, agent }, 'Unknown quant action in plan — skipping step');
            return null;
          }

          return {
            id: s.id ?? `step_${i + 1}`,
            agent,
            action,
            params: (s.params as Record<string, unknown>) ?? {},
            dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
            async: s.async === true,
            ...(s.fallbackAction ? { fallbackAction: s.fallbackAction } : {}),
          };
        })
        .filter((s): s is ExecutionStep => s !== null);

      logger.info({ stepCount: steps.length }, 'Plan generated (validated)');
      return steps;
    } catch (err) {
      logger.error({ raw, error: (err as Error).message }, 'Failed to parse planner JSON');
      return [];
    }
  }
}
