export type MarketRegimeLabel = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface MacroContext {
  fearGreedIndex: number;
  fearGreedLabel: string;
  btcDominance: number;
  marketRegime: MarketRegimeLabel;
  macroScore: number;
}

export class MacroContextFetcher {
  private cache = new Map<string, { data: unknown; expiry: number }>();

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiry) return entry.data as T;
    this.cache.delete(key);
    return null;
  }

  private setCached(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  async fetch(): Promise<MacroContext> {
    const cached = this.getCached<MacroContext>('macro_context');
    if (cached) return cached;

    const [fgResult, btcResult] = await Promise.allSettled([
      this.fetchFearGreed(),
      this.fetchBTCDominance(),
    ]);

    const fearGreedIndex = fgResult.status === 'fulfilled' ? fgResult.value : 50;
    const btcDominance = btcResult.status === 'fulfilled' ? btcResult.value : 50;

    const fearGreedLabel =
      fearGreedIndex > 60 ? 'Greed' : fearGreedIndex < 40 ? 'Fear' : 'Neutral';

    let marketRegime: MarketRegimeLabel = 'NEUTRAL';
    if (fearGreedIndex >= 55 && btcDominance < 55) marketRegime = 'RISK_ON';
    else if (fearGreedIndex <= 30 || btcDominance > 60) marketRegime = 'RISK_OFF';

    let macroScore = 10;
    if (marketRegime === 'RISK_ON') macroScore = 18;
    else if (marketRegime === 'RISK_OFF') macroScore = 4;
    if (fearGreedIndex < 20) macroScore = 14;

    const ctx: MacroContext = { fearGreedIndex, fearGreedLabel, btcDominance, marketRegime, macroScore };
    this.setCached('macro_context', ctx, 300_000);
    return ctx;
  }

  private async fetchFearGreed(): Promise<number> {
    try {
      const res = await fetch('https://api.alternative.me/fng/?limit=1', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return 50;
      const data = await res.json() as { data: { value: string }[] };
      return parseInt(data.data?.[0]?.value || '50', 10);
    } catch {
      return 50;
    }
  }

  private async fetchBTCDominance(): Promise<number> {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/global', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return 50;
      const data = await res.json() as { data: { market_cap_percentage: { btc: number } } };
      return data.data?.market_cap_percentage?.btc ?? 50;
    } catch {
      return 50;
    }
  }
}