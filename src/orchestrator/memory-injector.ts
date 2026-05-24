import type { ParsedIntent, AgentState } from '@/shared/types';
import type { MemoryStore } from '@/memory/vector-store';
import { logger } from '@/shared/logger';

export class MemoryInjector {
  constructor(private store: MemoryStore) {}

  async retrieve(intent: ParsedIntent): Promise<AgentState['memory']> {
    const entities = intent.entities;

    if (entities.length === 0) {
      logger.debug('No entities in intent — skipping memory retrieval');
      return { episodic: [], semantic: [] };
    }

    const query = entities.join(' ');
    logger.debug({ query, entityCount: entities.length }, 'MemoryInjector.retrieve');

    const results = await this.store.searchSimilar(query, undefined, 5);

    const semanticResults = results
      .filter((r) => r.similarity !== undefined && r.similarity > 0.7)
      .map((r) => ({
        content: r.content,
        metadata: r.metadata,
        similarity: r.similarity,
      }));

    logger.info(
      { totalResults: results.length, passedThreshold: semanticResults.length },
      'Memory retrieval completed',
    );

    return {
      episodic: [],
      semantic: semanticResults,
    };
  }
}
