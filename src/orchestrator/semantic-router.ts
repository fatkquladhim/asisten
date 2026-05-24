import type { ParsedIntent } from '@/shared/types';
import { logger } from '@/shared/logger';

export class SemanticRouter {
  async classify(input: string, summary?: string): Promise<ParsedIntent> {
    logger.debug({ inputLength: input.length, hasSummary: !!summary }, 'SemanticRouter.classify');

    return {
      domain: 'general',
      action: 'respond',
      entities: [],
    };
  }
}
