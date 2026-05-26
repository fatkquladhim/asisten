import { MarketIntelligence } from './market-intelligence';

export enum MarketRegime {
  DEFENSE = 'DEFENSE',
  WAR = 'WAR',
  PREDATOR = 'PREDATOR',
  NEUTRAL = 'NEUTRAL',
}

export interface MacroMetrics {
  fearAndGreed: number;
  btcDominance: number;
  btcTrend: 'UP' | 'DOWN' | 'SIDEWAYS';
  ethTrend: 'UP' | 'DOWN' | 'SIDEWAYS';
  ethStrength: number;
  altcoinVolume: number;
}

export interface ScannerFilters {
  minVolume: number;
  maxSpread: number;
  minScore: number;
}

export class MacroRegimeEngine {
  private marketIntel: MarketIntelligence;
  private cachedResult: { regime: MarketRegime; metrics: MacroMetrics } | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 6 * 60 * 60 * 1000;

  constructor(marketIntel: MarketIntelligence) {
    this.marketIntel = marketIntel;
  }

  async getCurrentRegime(): Promise<{ regime: MarketRegime; metrics: MacroMetrics }> {
    if (this.cachedResult && Date.now() < this.cacheExpiry) {
      return this.cachedResult;
    }

    try {
      const metrics = await this.fetchMetrics();
      let regime = MarketRegime.WAR;

      if (metrics.fearAndGreed > 60 && metrics.btcTrend === 'UP') {
        regime = MarketRegime.PREDATOR;
      }

      if (metrics.fearAndGreed < 40 || metrics.btcTrend === 'DOWN') {
        regime = MarketRegime.DEFENSE;
      }

      if (metrics.fearAndGreed < 25) regime = MarketRegime.DEFENSE;
      if (metrics.fearAndGreed > 75) regime = MarketRegime.PREDATOR;

      const result = { regime, metrics };
      this.cachedResult = result;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      return result;
    } catch {
      return {
        regime: MarketRegime.WAR,
        metrics: { fearAndGreed: 50, btcDominance: 50, btcTrend: 'SIDEWAYS', ethTrend: 'SIDEWAYS', ethStrength: 1, altcoinVolume: 1 },
      };
    }
  }

  getFilters(regime: MarketRegime): ScannerFilters {
    switch (regime) {
      case MarketRegime.DEFENSE:
        return { minVolume: 10_000_000, maxSpread: 2.5, minScore: 52 };
      case MarketRegime.WAR:
        return { minVolume: 15_000_000, maxSpread: 2.0, minScore: 50 };
      case MarketRegime.PREDATOR:
        return { minVolume: 30_000_000, maxSpread: 1.5, minScore: 65 };
      default:
        return { minVolume: 15_000_000, maxSpread: 2.0, minScore: 50 };
    }
  }

  private async fetchMetrics(): Promise<MacroMetrics> {
    const [fngResult, btcTrendResult, ethTrendResult, globalResult] = await Promise.allSettled([
      this.fetchFearGreed(),
      this.marketIntel.analyzeTrend('btc_idr'),
      this.marketIntel.analyzeTrend('eth_idr'),
      this.fetchGlobalData(),
    ]);

    const fearAndGreed = fngResult.status === 'fulfilled' ? fngResult.value : 50;
    const btcTrend = btcTrendResult.status === 'fulfilled' ? btcTrendResult.value.trendDaily : 'SIDEWAYS';
    const ethTrend = ethTrendResult.status === 'fulfilled' ? ethTrendResult.value.trendDaily : 'SIDEWAYS';

    let btcDominance = 52;
    let altcoinVolume = 1;
    let ethStrength = 1;

    if (globalResult.status === 'fulfilled') {
      const g = globalResult.value;
      btcDominance = g.marketCapPercentBtc ?? 52;
      const totalVol = g.totalVolumeUsd ?? 0;
      const btcVol = g.btcVolume ?? 1;
      altcoinVolume = totalVol > 0 ? Math.min(3, totalVol / (btcVol * 50000)) : 1;
      const ethDom = g.ethDominance ?? 15;
      ethStrength = btcDominance > 0 ? ethDom / btcDominance : 1;
    }

    return { fearAndGreed, btcDominance, btcTrend, ethTrend, ethStrength, altcoinVolume };
  }

  private async fetchFearGreed(): Promise<number> {
    try {
      const res = await fetch('https://api.alternative.me/fng/?limit=1', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return 50;
      const data = await res.json() as { data: { value: string }[] };
      return parseInt(data.data?.[0]?.value ?? '50', 10);
    } catch {
      return 50;
    }
  }

  private async fetchGlobalData(): Promise<{
    marketCapPercentBtc: number;
    ethDominance: number;
    totalVolumeUsd: number;
    btcVolume: number;
  }> {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/global', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { marketCapPercentBtc: 52, ethDominance: 15, totalVolumeUsd: 0, btcVolume: 1 };
      const data = await res.json() as {
        data: {
          market_cap_percentage: { btc: number; eth: number };
          total_volume: { usd: number; btc: number };
        };
      };
      const d = data.data;
      return {
        marketCapPercentBtc: d.market_cap_percentage?.btc ?? 52,
        ethDominance: d.market_cap_percentage?.eth ?? 15,
        totalVolumeUsd: d.total_volume?.usd ?? 0,
        btcVolume: d.total_volume?.btc ?? 1,
      };
    } catch {
      return { marketCapPercentBtc: 52, ethDominance: 15, totalVolumeUsd: 0, btcVolume: 1 };
    }
  }
}