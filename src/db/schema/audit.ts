import { pgTable, uuid, varchar, jsonb, timestamp, numeric, index } from 'drizzle-orm/pg-core';

/**
 * decision_audit — Immutable log of all high-level decisions (orchestrator + quant cycles).
 * 
 * Phase 1 foundation for 2026 agent security & compliance.
 * Stores: full context snapshot, LLM prompts/responses (hashed where possible), scores, chosen action, rationale.
 * Enables post-mortems, red-teaming, regulatory export, and "why did the agent do X" queries.
 * 
 * Never UPDATE or DELETE rows (append-only). Use retention policy externally.
 */
export const decisionAudit = pgTable('decision_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: varchar('conversation_id', { length: 64 }),
  trigger: varchar('trigger', { length: 20 }).notNull(), // 'chat' | 'cron' | 'event'
  domain: varchar('domain', { length: 20 }).notNull(),   // 'quant' | 'risk' etc.
  action: varchar('action', { length: 50 }).notNull(),
  pair: varchar('pair', { length: 20 }),

  // Core decision payload (JSON for flexibility)
  inputContext: jsonb('input_context').notNull(),   // summary of state, memory, scores
  llmPromptHash: varchar('llm_prompt_hash', { length: 128 }), // sha256 of prompt if applicable
  llmResponseHash: varchar('llm_response_hash', { length: 128 }),
  confidence: numeric('confidence', { precision: 5, scale: 2 }),
  finalScore: numeric('final_score', { precision: 8, scale: 4 }),
  chosenAction: varchar('chosen_action', { length: 50 }),
  rationale: varchar('rationale', { length: 2000 }),

  // Execution outcome (filled later for async/cron paths)
  outcome: jsonb('outcome'),
  pnlImpact: numeric('pnl_impact', { precision: 20, scale: 8 }),
  error: varchar('error', { length: 500 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  domainActionIdx: index('decision_audit_domain_action_idx').on(table.domain, table.action, table.createdAt),
  pairCreatedIdx: index('decision_audit_pair_created_idx').on(table.pair, table.createdAt),
  convIdx: index('decision_audit_conv_idx').on(table.conversationId),
}));
