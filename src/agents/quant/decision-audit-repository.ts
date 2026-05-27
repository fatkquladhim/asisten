import { getDb } from '@/config/database';
import { decisionAudit } from '@/db/schema/audit';
import { logger } from '@/shared/logger';

export interface AuditDecisionInput {
  conversationId?: string;
  trigger: 'chat' | 'event' | 'cron';
  domain: string; // 'quant' | 'risk' | etc.
  action: string;
  pair?: string;
  inputContext: Record<string, unknown>;
  llmPromptHash?: string;
  llmResponseHash?: string;
  confidence?: number;
  finalScore?: number;
  chosenAction?: string;
  rationale?: string;
  outcome?: Record<string, unknown>;
  pnlImpact?: number;
  error?: string;
}

export class DecisionAuditRepository {
  async logDecision(input: AuditDecisionInput): Promise<string | null> {
    try {
      const rows = await getDb()
        .insert(decisionAudit)
        .values({
          conversationId: input.conversationId ?? null,
          trigger: input.trigger,
          domain: input.domain,
          action: input.action,
          pair: input.pair ?? null,
          inputContext: input.inputContext,
          llmPromptHash: input.llmPromptHash ?? null,
          llmResponseHash: input.llmResponseHash ?? null,
          confidence: input.confidence != null ? String(input.confidence) : null,
          finalScore: input.finalScore != null ? String(input.finalScore) : null,
          chosenAction: input.chosenAction ?? null,
          rationale: input.rationale ?? null,
          outcome: input.outcome ?? null,
          pnlImpact: input.pnlImpact != null ? String(input.pnlImpact) : null,
          error: input.error ?? null,
        })
        .returning({ id: decisionAudit.id });

      const id = rows[0]?.id ?? null;
      if (id) {
        logger.debug({ id, domain: input.domain, action: input.action, pair: input.pair }, 'Decision audited');
      }
      return id;
    } catch (err) {
      logger.error({ error: (err as Error).message, action: input.action }, 'Failed to log decision audit');
      return null;
    }
  }
}

export const decisionAuditRepo = new DecisionAuditRepository();
