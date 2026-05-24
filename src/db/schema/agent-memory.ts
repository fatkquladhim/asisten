import {
  pgTable, uuid, varchar, text, jsonb, timestamp, interval, vector, pgIndex, index,
} from 'drizzle-orm/pg-core';

export const agentMemory = pgTable('agent_memory', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: varchar('agent_id', { length: 50 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  conversationId: uuid('conversation_id'),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').$type<{
    source?: string;
    confidence?: number;
    tokens?: number;
    tags?: string[];
    expiresAt?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  ttl: interval('ttl'),
}, (table) => ({
  embeddingIdx: pgIndex('agent_memory_hnsw_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),
  agentTypeIdx: index('agent_memory_agent_type_idx')
    .on(table.agentId, table.type),
}));
