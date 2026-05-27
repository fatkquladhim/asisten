import { env } from '@/config/index';
import { MarketIntelligence } from './market-intelligence';
import { IndodaxClient, IndodaxTicker } from './indodax-api';
import { AIResult } from './ai-consensus';
import { logger } from '@/shared/logger';

const DEFAULT_FREE_MODELS = 'qwen3.6-flash,qwen3.6-plus,gemma-4-31b-it';
const DEFAULT_FALLBACK_MODELS = 'deepseek-v4-flash,deepseek-v4-pro';

export class AISentinel {
  private apiKey: string;
  private baseUrl: string;
  private freeModels: string[];
  private fallbackModels: string[];
  private currentModelIdx = 0;
  private currentFallbackIdx = 0;

  constructor(
    private client: IndodaxClient,
    private marketIntel: MarketIntelligence,
  ) {
    this.apiKey = env.SUMOPOD_API_KEY || '';
    this.baseUrl = env.SUMOPOD_BASE_URL || 'https://ai.sumopod.com/v1';

    const freeEnv = process.env['SUMOPOD_FREE_MODELS'] ?? DEFAULT_FREE_MODELS;
    const fallbackEnv = process.env['SUMOPOD_FALLBACK_MODELS'] ?? DEFAULT_FALLBACK_MODELS;
    this.freeModels = freeEnv.split(',').map((m) => m.trim());
    this.fallbackModels = fallbackEnv.split(',').map((m) => m.trim());
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async analyzePair(pair: string): Promise<AIResult | null> {
    if (!this.isConfigured) return null;

    const marketData = await this.buildMarketDataForPair(pair);
    let result: AIResult | null = null;

    // Tier 1: Fallback models (first try)
    for (let i = 0; i < this.fallbackModels.length; i++) {
      const model = this.fallbackModels[this.currentFallbackIdx]!;
      try {
        const raw = await this.callSumopod(marketData, pair, model);
        result = this.parseAI(raw);
        if (result) {
          result.pair = pair;
          break;
        }
      } catch {
        this.currentFallbackIdx = (this.currentFallbackIdx + 1) % this.fallbackModels.length;
      }
    }

    // Tier 2: Free models (fallback)
    if (!result) {
      for (let i = 0; i < this.freeModels.length; i++) {
        const model = this.freeModels[this.currentModelIdx]!;
        try {
          const raw = await this.callSumopod(marketData, pair, model);
          result = this.parseAI(raw);
          if (result) {
            result.pair = pair;
            break;
          }
        } catch {
          this.currentModelIdx = (this.currentModelIdx + 1) % this.freeModels.length;
        }
      }
    }

    return result;
  }

  async analyzePairWithConsensus(pair: string, modelCount: number = 2): Promise<AIResult[]> {
    if (!this.isConfigured || modelCount < 1) return [];

    const marketData = await this.buildMarketDataForPair(pair);
    const models = [...this.fallbackModels, ...this.freeModels].slice(0, modelCount);
    const results: AIResult[] = [];

    for (const model of models) {
      try {
        const raw = await this.callSumopod(marketData, pair, model);
        const parsed = this.parseAI(raw);
        if (parsed) {
          parsed.pair = pair;
          results.push(parsed);
        }
      } catch (err) {
        logger.warn({ model, err }, 'AI model failed');
      }
    }

    return results;
  }

  private async buildMarketDataForPair(pair: string): Promise<string> {
    try {
      const [ticker, trend, ob] = await Promise.all([
        this.client.publicRequest<IndodaxTicker>(`/api/ticker/${pair}`),
        this.marketIntel.analyzeTrend(pair),
        this.marketIntel.analyzeOrderbook(pair),
      ]);

      const t = ticker.ticker;
      const spread = Number(t.sell) > 0 && Number(t.buy) > 0
        ? ((Number(t.sell) - Number(t.buy)) / Number(t.sell) * 100).toFixed(2)
        : 'N/A';

      return [
        `Pair: ${pair.toUpperCase()}`,
        `Price: Rp ${t.last}`,
        `24h High/Low: ${t.high} / ${t.low}`,
        `Spread: ${spread}%`,
        `Trend: ${trend.alignment} (Score: ${trend.trendScore})`,
        `RSI: ${trend.rsiRegime}`,
        `Orderbook: ${ob.summary}`,
      ].join('\n');
    } catch {
      return `Pair: ${pair.toUpperCase()}\nError fetching market data`;
    }
  }

  private buildPrompt(data: string, pair: string): string {
    const isMemeOrAI = ['doge', 'pepe', 'fet', 'pippin', 'fartcoin', 'zerebro', 'bonk', 'wif']
      .some((s) => pair.includes(s));
    // Phase 1 fix: No confirmation bias. Meme/AI assets require stricter scrutiny.
    const booster = isMemeOrAI
      ? 'WARNING: High-volatility Meme/AI asset. Require score >= 80 and HIGH confidence before BUY. Default to AVOID.'
      : '';

    return [
      'Kamu adalah Alpha Hunter AI, spesialis Quant Trading.',
      `Tugas: Berikan analisa trading presisi untuk ${pair.toUpperCase()}.`,
      '',
      'DATA PASAR:',
      data,
      '',
      booster,
      '',
      'ATURAN SKORING:',
      '- 80-100: Setup Elite (High Probability)',
      '- 60-79: Setup Valid (Good R:R)',
      '- 40-59: Konsolidasi/Wait',
      '- 0-39: Bearish/Berisiko',
      '',
      'RESPON DALAM JSON SAJA:',
      '{',
      '  "action": "BUY" | "SELL" | "AVOID",',
      '  "score": number,',
      '  "regime": "BULLISH" | "SIDEWAYS" | "BEARISH",',
      '  "confidence": "HIGH" | "MID" | "LOW",',
      '  "precise_entry": number,',
      '  "precise_sl": number,',
      '  "precise_tp": number,',
      '  "why_now": "alasan singkat 1 kalimat"',
      '}',
    ].join('\n');
  }

  private async callSumopod(marketData: string, pair: string, model: string): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: this.buildPrompt(marketData, pair) }],
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (res.status === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 5000));
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
        }

        const data = await res.json() as { choices: { message: { content: string } }[] };
        return data.choices?.[0]?.message?.content || '';
      } catch (err) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }
        throw err;
      }
    }
    return '';
  }

  private parseAI(raw: string): AIResult | null {
    try {
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      return {
        pair: '',
        action: parsed.action || 'AVOID',
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        regime: parsed.regime || 'SIDEWAYS',
        confidence: parsed.confidence || 'LOW',
        precise_entry: parsed.precise_entry ?? null,
        precise_sl: parsed.precise_sl ?? null,
        precise_tp: parsed.precise_tp ?? null,
        why_now: parsed.why_now || '',
      };
    } catch {
      return null;
    }
  }
}