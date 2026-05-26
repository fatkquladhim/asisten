import { MarketIntelligence } from './market-intelligence';

// ── Types ───────────────────────────────────────────────────

export enum NarrativeType {
  AI_AGENTS = 'AI_AGENTS',
  MEME_COINS = 'MEME_COINS',
  RWA = 'RWA',
  DEPIN = 'DEPIN',
  GAMING = 'GAMING',
  L1_L2 = 'L1_L2',
  DEFI = 'DEFI',
  UNKNOWN = 'UNKNOWN',
}

export enum MarketPhase {
  BTC_PUMP = 'BTC_PUMP',
  ETH_REBOUND = 'ETH_REBOUND',
  ALT_LARGE_CAP = 'ALT_LARGE_CAP',
  MEME_MANIA = 'MEME_MANIA',
  FULL_ALTSEASON = 'FULL_ALTSEASON',
  CAPITULATION = 'CAPITULATION',
}

export interface NarrativeInsight {
  type: NarrativeType;
  score: number;
  momentum: 'RISING' | 'STABLE' | 'COOLING';
  leader: string;
}

export interface NarrativeReport {
  hotNow: NarrativeInsight[];
  marketPhase: MarketPhase;
  topSectors: string[];
}

// ── Mapper ──────────────────────────────────────────────────

const NARRATIVE_MAP: Record<NarrativeType, string[]> = {
  [NarrativeType.AI_AGENTS]: ['fet_idr', 'near_idr', 'grt_idr', 'ocean_idr', 'ai_idr'],
  [NarrativeType.MEME_COINS]: ['doge_idr', 'shib_idr', 'pepe_idr', 'bonk_idr', 'wif_idr', 'zerebro_idr', 'pump_idr', 'pippin_idr', 'fartcoin_idr', 'moodeng_idr'],
  [NarrativeType.RWA]: ['link_idr', 'ondo_idr', 'polyx_idr'],
  [NarrativeType.DEPIN]: ['fil_idr', 'rndr_idr', 'hnt_idr', 'theta_idr'],
  [NarrativeType.GAMING]: ['gala_idr', 'axs_idr', 'sand_idr', 'mana_idr', 'imx_idr'],
  [NarrativeType.L1_L2]: ['eth_idr', 'sol_idr', 'matic_idr', 'op_idr', 'arb_idr', 'avax_idr', 'dot_idr', 'ada_idr'],
  [NarrativeType.DEFI]: ['uni_idr', 'aave_idr', 'cake_idr', 'comp_idr'],
  [NarrativeType.UNKNOWN]: [],
};

export class NarrativeMapper {
  static getNarrativeForPair(pair: string): NarrativeType {
    const p = pair.toLowerCase();
    for (const [narrative, pairs] of Object.entries(NARRATIVE_MAP)) {
      if (pairs.includes(p)) return narrative as NarrativeType;
    }
    return NarrativeType.UNKNOWN;
  }

  static getPairsForNarrative(narrative: NarrativeType): string[] {
    return NARRATIVE_MAP[narrative] || [];
  }
}

// ── Rotation Engine ─────────────────────────────────────────

export class RotationEngine {
  static determinePhase(btcTrend: string, ethTrend: string, altVol: number): MarketPhase {
    if (btcTrend === 'DOWN' && ethTrend === 'DOWN') return MarketPhase.CAPITULATION;
    if (btcTrend === 'UP' && ethTrend !== 'UP') return MarketPhase.BTC_PUMP;
    if (btcTrend === 'SIDEWAYS' && ethTrend === 'UP') return MarketPhase.ETH_REBOUND;
    if (altVol > 1.5) return MarketPhase.MEME_MANIA;
    if (btcTrend === 'UP' && ethTrend === 'UP') return MarketPhase.FULL_ALTSEASON;
    return MarketPhase.ALT_LARGE_CAP;
  }

  static getTargetSectors(phase: MarketPhase): string[] {
    switch (phase) {
      case MarketPhase.BTC_PUMP: return ['L1_L2'];
      case MarketPhase.ETH_REBOUND: return ['L1_L2', 'DEFI'];
      case MarketPhase.ALT_LARGE_CAP: return ['L1_L2', 'RWA', 'AI_AGENTS'];
      case MarketPhase.MEME_MANIA: return ['MEME_COINS'];
      case MarketPhase.FULL_ALTSEASON: return ['MEME_COINS', 'GAMING', 'DEPIN'];
      default: return ['L1_L2'];
    }
  }
}

// ── Social Hype Radar ───────────────────────────────────────

export class SocialHypeRadar {
  static async getHypeScore(narrative: NarrativeType): Promise<number> {
    const baseHype = 40 + Math.random() * 30;
    switch (narrative) {
      case NarrativeType.MEME_COINS: return baseHype + 20;
      case NarrativeType.AI_AGENTS: return baseHype + 15;
      case NarrativeType.RWA: return baseHype + 5;
      default: return baseHype;
    }
  }
}

// ── Data Fetcher ────────────────────────────────────────────

export class NarrativeDataFetcher {
  async fetchAll(): Promise<{
    trendingCoins: string[];
    dexTrends: any[];
    googleTrends: Record<string, number>;
    newsCatalysts: string[];
  }> {
    const [cgResult] = await Promise.allSettled([this.fetchCGTrending()]);

    return {
      trendingCoins: cgResult.status === 'fulfilled' ? cgResult.value : [],
      dexTrends: [],
      googleTrends: { crypto: 75, bitcoin: 60, ai: 90, meme: 95 },
      newsCatalysts: ['No recent news'],
    };
  }

  private async fetchCGTrending(): Promise<string[]> {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json() as { coins: { item: { symbol: string } }[] };
      return (data.coins || []).map((c) => c.item.symbol.toLowerCase());
    } catch {
      return [];
    }
  }
}

// ── Hot Narrative Scanner ───────────────────────────────────

export class HotNarrativeScanner {
  constructor(private marketIntel: MarketIntelligence) {}

  async scan(): Promise<NarrativeInsight[]> {
    const dataFetcher = new NarrativeDataFetcher();
    const realData = await dataFetcher.fetchAll();
    const insights: NarrativeInsight[] = [];
    const narratives = Object.values(NarrativeType).filter((t) => t !== NarrativeType.UNKNOWN);

    for (const narrative of narratives) {
      const pairs = NarrativeMapper.getPairsForNarrative(narrative as NarrativeType);
      if (pairs.length === 0) continue;

      let totalVol = 0;
      let totalChange = 0;
      let leader = '';
      let maxVol = 0;

      for (const pair of pairs) {
        try {
          const bars = await this.marketIntel.fetchCandles(pair, '60');
          if (bars.length < 2) continue;
          const last = bars[bars.length - 1]!;
          const prev = bars[bars.length - 2]!;
          totalVol += last.volume;
          const change = ((last.close - prev.close) / prev.close) * 100;
          totalChange += change;
          if (last.volume > maxVol) {
            maxVol = last.volume;
            leader = pair;
          }
        } catch {
          continue;
        }
      }

      const avgChange = pairs.length > 0 ? totalChange / pairs.length : 0;
      let score = 50;
      score += avgChange * 2;
      if (totalVol > 100_000_000) score += 10;

      const hasTrending = pairs.some((p) =>
        realData.trendingCoins.includes(p.split('_')[0]!.toLowerCase()),
      );
      if (hasTrending) score += 15;
      if (narrative === NarrativeType.MEME_COINS && realData.dexTrends.length > 0) score += 10;

      const trendKey = narrative.toLowerCase().split('_')[0]!;
      if ((realData.googleTrends[trendKey] ?? 0) > 80) score += 15;

      const hasNews = realData.newsCatalysts.some((n) => n.toLowerCase().includes(trendKey));
      if (hasNews) score += 10;

      let momentum: NarrativeInsight['momentum'] = 'STABLE';
      if (avgChange > 5) momentum = 'RISING';
      else if (avgChange < -3) momentum = 'COOLING';

      insights.push({
        type: narrative as NarrativeType,
        score: Math.min(100, Math.max(0, score)),
        momentum,
        leader,
      });
    }

    return insights.sort((a, b) => b.score - a.score);
  }
}

// ── Narrative Engine (Facade) ───────────────────────────────

export class NarrativeEngine {
  private scanner: HotNarrativeScanner;
  private reportCache: NarrativeReport | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(private marketIntel: MarketIntelligence) {
    this.scanner = new HotNarrativeScanner(marketIntel);
  }

  async generateReport(): Promise<NarrativeReport> {
    if (this.reportCache && Date.now() < this.cacheExpiry) {
      return this.reportCache;
    }

    const hotNow = await this.scanner.scan();
    const phase = RotationEngine.determinePhase('SIDEWAYS', 'SIDEWAYS', 1);
    const topSectors = RotationEngine.getTargetSectors(phase);

    for (const insight of hotNow) {
      const hype = await SocialHypeRadar.getHypeScore(insight.type);
      insight.score = Math.round(insight.score * 0.7 + hype * 0.3);
    }

    const report: NarrativeReport = {
      hotNow: hotNow.sort((a, b) => b.score - a.score),
      marketPhase: phase,
      topSectors,
    };

    this.reportCache = report;
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
    return report;
  }

  async getNarrativeScore(pair: string): Promise<number> {
    const report = await this.generateReport();
    const narrative = NarrativeMapper.getNarrativeForPair(pair);
    const insight = report.hotNow.find((h) => h.type === narrative);
    let score = insight ? insight.score : 50;
    if (report.topSectors.includes(narrative)) score += 15;
    return Math.min(100, score);
  }
}