import { IndodaxClient } from './indodax-api';
import { MarketIntelligence } from './market-intelligence';
import { MacroContextFetcher, MacroContext } from './macro-context';

// ── Types ───────────────────────────────────────────────────

export interface CoinProfile {
  symbol: string;
  pair: string;
  name: string;
  type: 'MIDCAP' | 'LOWCAP' | 'BLUECHIP' | 'UNKNOWN';
  marketCapRank: number;
  marketCapUsd: number;
  priceIdr: number;
  high24h: number;
  low24h: number;
  volIdr: number;
  spread: number;
  positionIn24hRange: number;
  trendScore: number;
  momentumScore: number;
  volumeScore: number;
  btcContextScore: number;
  spreadScore: number;
  rrScore: number;
  totalScore: number;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  whyBuy: string;
  rejected: boolean;
  rejectReason?: string;
  trendAlignment?: string;
  obSummary?: string;
}

// ── AlphaHunter Scanner ─────────────────────────────────────

export class AlphaHunter {
  private macro: MacroContextFetcher;
  private cgCache: { data: any[]; expiry: number } | null = null;

  constructor(
    private client: IndodaxClient,
    private marketIntel: MarketIntelligence,
  ) {
    this.macro = new MacroContextFetcher();
  }

  async hunt(topN: number = 10): Promise<CoinProfile[]> {
    // Step 1: Macro Context
    const macro = await this.macro.fetch();

    // Step 2: Get all pairs + all tickers
    const [allPairs, allTickers] = await Promise.all([
      this.client.getAllPairs(),
      this.client.getAllTickers(),
    ]);

    const idrPairs = allPairs.map((p) => ({
      symbol: p.symbol,
      pair: `${p.symbol}_idr`,
    }));

    // Step 3: Quick filter — top 50 by volume (min 1M IDR)
    const quickShortlist = idrPairs
      .map((p) => ({ ...p, ticker: allTickers[p.pair] || allTickers[p.symbol + 'idr'] }))
      .filter((p): p is typeof p & { ticker: Record<string, string> } =>
        !!p.ticker && parseFloat(p.ticker.vol_idr) > 1_000_000,
      )
      .sort((a, b) => parseFloat(b.ticker.vol_idr || '0') - parseFloat(a.ticker.vol_idr || '0'))
      .slice(0, 50);

    // Step 4: CoinGecko data
    const cgData = await this.getCoinGeckoMarkets();
    const cgMap = new Map<string, any>();
    for (const coin of cgData) {
      cgMap.set(coin.symbol.toLowerCase(), coin);
    }

    // Step 5: Score candidates
    const candidates: CoinProfile[] = [];

    for (const { symbol, pair, ticker } of quickShortlist) {
      if (['usdt', 'usdc', 'dai', 'busd', 'tusd', 'bidr'].includes(symbol)) continue;

      const priceIdr = parseFloat(ticker.last) || 0;
      const high24h = parseFloat(ticker.high) || priceIdr;
      const low24h = parseFloat(ticker.low) || priceIdr;
      const volIdr = parseFloat(ticker.vol_idr) || 0;
      const bestBid = parseFloat(ticker.buy) || 0;
      const bestAsk = parseFloat(ticker.sell) || 0;
      const spread = bestAsk > 0 && bestBid > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : 9.9;

      if (priceIdr === 0 || volIdr === 0) continue;

      const range = high24h - low24h || 1;
      const positionIn24hRange = ((priceIdr - low24h) / range) * 100;

      const cg = cgMap.get(symbol);
      const rank = cg?.market_cap_rank || 9999;
      const mcapUsd = cg?.market_cap || 0;

      let type: CoinProfile['type'] = 'UNKNOWN';
      if (rank >= 1 && rank <= 49) type = 'BLUECHIP';
      else if (rank >= 50 && rank <= 250) type = 'MIDCAP';
      else if (rank >= 251 && rank <= 1000) type = 'LOWCAP';

      const fundamentalScore = this.scoreFundamental(cg, rank);
      const technicalScore = this.scoreTechnical(priceIdr, high24h, low24h, volIdr, spread, positionIn24hRange);
      const narrativeScore = 5; // placeholder until NarrativeEngine is ported
      const penalty = spread > 3 ? -15 : volIdr < 5_000_000 ? -10 : 0;

      const preScore = fundamentalScore + technicalScore + narrativeScore + penalty;

      const momScore = positionIn24hRange >= 20 && positionIn24hRange <= 50 ? 20 :
                       positionIn24hRange > 50 && positionIn24hRange <= 80 ? 15 :
                       positionIn24hRange > 80 ? 5 : 10;
      const volScore = volIdr > 2_000_000_000 ? 15 : volIdr > 500_000_000 ? 12 : volIdr > 100_000_000 ? 8 : 3;
      const sprdScore = spread < 0.2 ? 10 : spread < 0.5 ? 7 : spread < 0.8 ? 4 : 0;

      candidates.push({
        symbol, pair, name: cg?.name || symbol.toUpperCase(),
        type, marketCapRank: rank, marketCapUsd: mcapUsd,
        priceIdr, high24h, low24h, volIdr, spread,
        positionIn24hRange,
        trendScore: 0,
        momentumScore: momScore,
        volumeScore: volScore,
        btcContextScore: macro.macroScore,
        spreadScore: sprdScore,
        rrScore: 0,
        totalScore: Math.max(0, preScore),
        entry: priceIdr,
        sl: Math.max(low24h, priceIdr * 0.97),
        tp1: priceIdr * 1.04,
        tp2: priceIdr * 1.08,
        whyBuy: '',
        rejected: false,
      });
    }

    // Step 6: Pre-rank → top 15 for deep analysis
    const topScorers = candidates
      .filter((c) => !c.rejected)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 15);

    // Step 7: Market Intelligence deep analysis
    for (const c of topScorers) {
      await new Promise((r) => setTimeout(r, 300));

      const [trend, ob, atr] = await Promise.all([
        this.marketIntel.analyzeTrend(c.pair),
        this.marketIntel.analyzeOrderbook(c.pair),
        this.marketIntel.calculateATRTargets(c.pair, c.priceIdr),
      ]);

      c.trendAlignment = trend.alignment;
      c.obSummary = ob.summary;

      c.trendScore = trend.alignment === 'BULLISH' ? 25 :
                     trend.alignment === 'MOMENTUM' ? 22 :
                     trend.alignment === 'RANGE_BREAKOUT' ? 20 :
                     trend.alignment === 'LEAN_BULLISH' ? 18 :
                     trend.alignment === 'ACCUMULATION' ? 14 :
                     trend.alignment === 'MIXED' ? 8 : 0;

      if (trend.trendScore > 10) c.trendScore = Math.min(25, c.trendScore + 5);
      if (trend.rsiRegime === 'OVERSOLD') c.trendScore = Math.min(25, c.trendScore + 5);
      else if (trend.rsiRegime === 'OVERBOUGHT') c.trendScore = Math.max(0, c.trendScore - 10);

      c.rrScore = atr.rrRatio >= 2.0 ? 10 : atr.rrRatio >= 1.5 ? 6 : atr.rrRatio >= 1.0 ? 3 : 0;

      c.totalScore = c.trendScore + c.momentumScore + c.volumeScore + c.btcContextScore + c.spreadScore + c.rrScore + ob.obScore;

      c.entry = c.priceIdr;
      c.sl = atr.sl;
      c.tp1 = atr.tp1;
      c.tp2 = atr.tp2;

      if (trend.alignment === 'BEARISH' || trend.alignment === 'LEAN_BEARISH') {
        c.rejected = true;
        c.rejectReason = `Downtrend (${trend.alignment})`;
      } else if (ob.hasSpoofWall) {
        c.rejected = true;
        c.rejectReason = 'Spoof Wall detected';
      }
    }

    // Step 8: Final rank
    const sorted = topScorers
      .filter((c) => !c.rejected)
      .sort((a, b) => b.totalScore - a.totalScore);

    return sorted.slice(0, topN);
  }

  private async getCoinGeckoMarkets(): Promise<any[]> {
    if (this.cgCache && Date.now() < this.cgCache.expiry) return this.cgCache.data;

    try {
      const urls = [
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false',
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&sparkline=false',
      ];

      const results = await Promise.all(
        urls.map((url) =>
          fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
          }).then((r) => (r.ok ? r.json() : [])),
        ),
      );

      const data = results.flat();
      this.cgCache = { data, expiry: Date.now() + 600_000 };
      return data;
    } catch {
      return [];
    }
  }

  private scoreFundamental(cg: any, rank: number): number {
    if (!cg) return 10;
    let score = 0;

    if (rank <= 100) score += 20;
    else if (rank <= 200) score += 15;
    else if (rank <= 350) score += 10;
    else score += 5;

    const change24h = cg.price_change_percentage_24h || 0;
    if (change24h > 5) score += 10;
    else if (change24h > 2) score += 7;
    else if (change24h > 0) score += 4;
    else if (change24h > -3) score += 2;
    else score -= 2;

    const volToMcap = cg.market_cap > 0 ? (cg.total_volume / cg.market_cap) : 0;
    if (volToMcap > 0.3) score += 10;
    else if (volToMcap > 0.1) score += 6;
    else if (volToMcap > 0.05) score += 2;

    return Math.max(0, Math.min(40, score));
  }

  private scoreTechnical(
    _price: number, high: number, low: number,
    volIdr: number, spread: number, position: number,
  ): number {
    let score = 0;

    if (position >= 20 && position <= 45) score += 15;
    else if (position >= 45 && position <= 65) score += 8;
    else if (position > 65) score += 3;
    else score += 10;

    if (volIdr > 1_000_000_000) score += 15;
    else if (volIdr > 100_000_000) score += 12;
    else if (volIdr > 20_000_000) score += 8;
    else score += 3;

    if (spread < 0.2) score += 10;
    else if (spread < 0.5) score += 7;
    else if (spread < 0.8) score += 4;
    else score += 1;

    return Math.max(0, Math.min(40, score));
  }
}