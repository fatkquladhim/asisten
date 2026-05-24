import { sql } from 'drizzle-orm';
import { getDb } from '@/config/database';
import { agentMemory } from '@/db/schema/agent-memory';
import { EmbeddingClient } from './embedding';
import { logger } from '@/shared/logger';

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: 'episodic' | 'semantic';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  similarity?: number;
}

export class MemoryStore {
  constructor(private embedder: EmbeddingClient) {}

  async saveMemory(
    agentId: string,
    type: 'episodic' | 'semantic',
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const start = performance.now();

    const embedding = await this.embedder.generateEmbedding(content);
    const db = getDb();

    const result = await db
      .insert(agentMemory)
      .values({
        agentId,
        type,
        content,
        embedding: embedding as unknown as number[],
        metadata: metadata as Record<string, unknown> | null,
      })
      .returning({ id: agentMemory.id });

    const elapsed = (performance.now() - start).toFixed(1);
    logger.debug({ agentId, type, id: result[0]?.id, ms: elapsed }, 'Memory saved');

    return result[0]?.id ?? '';
  }

  async searchSimilar(
    queryText: string,
    agentId?: string,
    limit = 5,
  ): Promise<MemoryEntry[]> {
    const start = performance.now();

    const embedding = await this.embedder.generateEmbedding(queryText);
    const db = getDb();

    const vectorLiteral = `[${embedding.join(',')}]`;

    const conditions = [sql`${agentMemory.embedding} IS NOT NULL`];
    if (agentId) {
      conditions.push(sql`${agentMemory.agentId} = ${agentId}`);
    }

    const results = await db
      .select({
        id: agentMemory.id,
        agentId: agentMemory.agentId,
        type: agentMemory.type,
        content: agentMemory.content,
        metadata: agentMemory.metadata,
        createdAt: agentMemory.createdAt,
        similarity: sql<number>`1 - (${agentMemory.embedding} <=> ${sql.raw(vectorLiteral)}::vector)`,
      })
      .from(agentMemory)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(sql`${agentMemory.embedding} <=> ${sql.raw(vectorLiteral)}::vector`)
      .limit(limit);

    const elapsed = (performance.now() - start).toFixed(1);
    logger.debug(
      { queryLength: queryText.length, results: results.length, ms: elapsed },
      'Memory search completed',
    );

    return results.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      type: r.type as 'episodic' | 'semantic',
      content: r.content,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt,
      similarity: r.similarity,
    }));
  }
}
