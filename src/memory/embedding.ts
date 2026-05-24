import { env } from '@/config/index';
import { logger } from '@/shared/logger';

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';

export class EmbeddingClient {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = env.OPENAI_API_KEY ?? '';
    this.model = 'text-embedding-3-small';
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isConfigured) {
      logger.warn('OpenAI API key not set — returning zero vector for embedding');
      return this.zeroVector();
    }

    const start = performance.now();

    try {
      const response = await fetch(OPENAI_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ status: response.status, body }, 'Embedding API error');
        return this.zeroVector();
      }

      const data = (await response.json()) as {
        data: { embedding: number[] }[];
        usage: { total_tokens: number };
      };

      const elapsed = (performance.now() - start).toFixed(1);
      logger.debug(
        { tokens: data.usage?.total_tokens, ms: elapsed },
        'Embedding generated',
      );

      return data.data[0]?.embedding ?? this.zeroVector();
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Embedding request failed');
      return this.zeroVector();
    }
  }

  private zeroVector(): number[] {
    return new Array(1536).fill(0);
  }
}
