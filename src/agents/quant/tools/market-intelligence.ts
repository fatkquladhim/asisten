import { IndodaxClient } from './indodax-api';
import { OHLCBar, calculateATR, calculateWilderRSI, detectTrend, calculateEMA } from './technical-analysis';

// ── Types ───────────────────────────────────────────────────

export interface TrendAnalysis {
  trend1H: 'UP' | 'DOWN' | 'SIDEWAYS';
  trend4H: 'UP' | 'DOWN' | 'SIDEWAYS';
  trendDaily: 'UP' | 'DOWN' | 'SIDEWAYS';
  alignment: 'BULLISH' | 'LEAN_BULLISH' | 'MIXED' | 'LEAN_BEARISH' | 'BEARISH' | 'RANGE_BREAKOUT' | 'ACCUMULATION' | 'MOMENTUM';
  rsiRegime: 'OVERBOUGHT' | 'OVERSOLD' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendScore: number;
}

export interface OrderbookAnalysis {
  bidWallStrength: number;
  askWallStrength: number;
  hasSpoofWall: boolean;
  whaleAbsorbing: boolean;
  obScore: number;
  summary: string;
}

export interface ATRTargets {
  atr: number;
  atrPct: number;
  sl: number;
  tp1: number;
  tp2: number;
  rrRatio: number;
}

export interface SMCRawResult {
  bos: 'BULLISH' | 'BEARISH' | 'NONE';
  choch: 'BULLISH' | 'BEARISH' | 'NONE';
  liquiditySweep: 'BUY_SIDE' | 'SELL_SIDE' | 'NONE';
  orderBlock: number;
  summary: string;
}

// ── Market Intelligence ────────────────────────────────────

export class MarketIntelligence {
  constructor(private client: IndodaxClient) {}

  async fetchCandles(pair: string, resolution: string, from?: number, to?: number): Promise<OHLCBar[]> {
    const symbol = pair.includes('_idr')
      ? pair.replace('_idr', '').toUpperCase() + 'IDR'
      : pair.toUpperCase();

    const now = Math.floor(Date.now() / 1000);
    const effectiveFrom = from ?? (now - 3600 * 24);
    const effectiveTo = to ?? now;

    // Try Indodax TradingView endpoint
    try {
      const url = `https://indodax.com/tradingview/history?symbol=${symbol}&resolution=${resolution}&from=${effectiveFrom}&to=${effectiveTo}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://indodax.com/',
        },
      });

      if (response.ok) {
        const text = await response.text();
        if (text && text !== 'OK') {
          const d = JSON.parse(text) as { s: string; t: number[]; o: string[]; h: string[]; l: string[]; c: string[]; v: string[] };
          if (d && d.s === 'ok' && d.t && d.t.length > 1) {
            return d.t.map((t: number, i: number) => ({
              time: t,
              open: parseFloat(d.o[i]!),
              high: parseFloat(d.h[i]!),
              low: parseFloat(d.l[i]!),
              close: parseFloat(d.c[i]!),
              volume: parseFloat(d.v[i] ?? '0'),
            }));
          }
        }
      }
    } catch {
      // fall through to CoinGecko fallback
    }

    // Fallback: CoinGecko OHLC API
    return this.fetchCandlesFromCoinGecko(pair, resolution, effectiveFrom, effectiveTo);
  }

  private async fetchCandlesFromCoinGecko(pair: string, resolution: string, from: number, to: number): Promise<OHLCBar[]> {
    const id = COINGECKO_IDS[pair.toLowerCase()];
    if (!id) return [];

    const days = Math.ceil((to - from) / 86400);
    if (days <= 0) return [];

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=idr&days=${Math.max(1, Math.min(days, 90))}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return [];
      const data = await res.json() as [number, number, number, number, number][];
      if (!Array.isArray(data) || data.length < 2) return [];

      return data.map(([timestamp, open, high, low, close]) => ({
        time: Math.floor(timestamp / 1000),
        open, high, low, close,
        volume: 0, // CoinGecko OHLC doesn't include volume
      }));
    } catch {
      return [];
    }
  }

  async analyzeTrend(pair: string): Promise<TrendAnalysis> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const [h1Bars, h4Bars, dailyBars] = await Promise.all([
        this.fetchCandles(pair, '60', now - 48 * 3600, now),
        this.fetchCandles(pair, '240', now - 30 * 4 * 3600, now),
        this.fetchCandles(pair, 'D', now - 30 * 86400, now),
      ]);

      const trend1H = detectTrend(h1Bars);
      const trend4H = detectTrend(h4Bars);
      const trendDaily = detectTrend(dailyBars);

      const bullCount = [trend1H, trend4H, trendDaily].filter((t) => t === 'UP').length;
      const bearCount = [trend1H, trend4H, trendDaily].filter((t) => t === 'DOWN').length;
      const sideCount = [trend1H, trend4H, trendDaily].filter((t) => t === 'SIDEWAYS').length;

      let alignment: TrendAnalysis['alignment'];
      let trendScore = 0;

      if (bullCount === 3) {
        alignment = 'BULLISH';
        trendScore = 20;
      } else if (sideCount >= 2 && trend1H === 'UP') {
        alignment = 'RANGE_BREAKOUT';
        trendScore = 18;
      } else if (sideCount === 3) {
        alignment = 'ACCUMULATION';
        trendScore = 12;
      } else if (bullCount >= 2 && trend1H === 'UP') {
        alignment = 'MOMENTUM';
        trendScore = 15;
      } else if (bullCount === 2 && bearCount === 0) {
        alignment = 'LEAN_BULLISH';
        trendScore = 12;
      } else if (bullCount === 2 && bearCount === 1) {
        alignment = 'LEAN_BULLISH';
        trendScore = 5;
      } else if (bearCount === 3) {
        alignment = 'BEARISH';
        trendScore = -20;
      } else if (bearCount === 2 && bullCount === 0) {
        alignment = 'LEAN_BEARISH';
        trendScore = -12;
      } else if (bearCount === 2 && bullCount === 1) {
        alignment = 'LEAN_BEARISH';
        trendScore = -5;
      } else {
        alignment = 'MIXED';
        trendScore = 0;
      }

      const closes4H = h4Bars.map((b) => b.close);
      const closesDaily = dailyBars.map((b) => b.close);
      const rsiDaily = closesDaily.length > 14 ? calculateWilderRSI(closesDaily, 14) : 50;

      let rsiRegime: TrendAnalysis['rsiRegime'] = 'NEUTRAL';
      if (rsiDaily > 70) rsiRegime = 'OVERBOUGHT';
      else if (rsiDaily < 30) rsiRegime = 'OVERSOLD';
      else if (rsiDaily > 55) rsiRegime = 'BULLISH';
      else if (rsiDaily < 45) rsiRegime = 'BEARISH';

      if (rsiRegime === 'OVERSOLD') trendScore += 5;
      if (rsiRegime === 'OVERBOUGHT') trendScore -= 15;

      return { trend1H, trend4H, trendDaily, alignment, rsiRegime, trendScore };
    } catch {
      return {
        trend1H: 'SIDEWAYS', trend4H: 'SIDEWAYS', trendDaily: 'SIDEWAYS',
        alignment: 'MIXED', rsiRegime: 'NEUTRAL', trendScore: 0,
      };
    }
  }

  async analyzeSMC(pair: string): Promise<SMCRawResult> {
    try {
      const h4Bars = await this.fetchCandles(pair, '240');
      if (h4Bars.length < 10) return { bos: 'NONE', choch: 'NONE', liquiditySweep: 'NONE', orderBlock: 0, summary: 'No 4H data' };

      const last = h4Bars[h4Bars.length - 1]!;
      const recentBars = h4Bars.slice(-11, -1);
      const swingHigh = Math.max(...recentBars.map((b) => b.high));
      const swingLow = Math.min(...recentBars.map((b) => b.low));

      let bos: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
      let choch: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
      let liquiditySweep: 'BUY_SIDE' | 'SELL_SIDE' | 'NONE' = 'NONE';
      let orderBlock = 0;

      if (last.close > swingHigh) {
        bos = 'BULLISH';
        choch = 'BULLISH';
      } else if (last.close < swingLow) {
        bos = 'BEARISH';
        choch = 'BEARISH';
      }

      if (last.high > swingHigh && last.close < swingHigh) {
        liquiditySweep = 'BUY_SIDE';
      } else if (last.low < swingLow && last.close > swingLow) {
        liquiditySweep = 'SELL_SIDE';
      }

      if (bos === 'BULLISH') {
        const obCandle = h4Bars.slice(-4, -1).reduce((min, b) => (b.low < min.low ? b : min));
        if (obCandle.close < obCandle.open) {
          orderBlock = obCandle.low;
        }
      }

      let summary = '';
      if (bos !== 'NONE') summary += `[${bos} BoS] `;
      if (liquiditySweep !== 'NONE') summary += `[Swept ${liquiditySweep}] `;
      if (orderBlock > 0) summary += `[OB: ${orderBlock.toLocaleString()}]`;
      if (summary === '') summary = '[Accumulation/Distribution inside range]';

      return { bos, choch, liquiditySweep, orderBlock, summary: summary.trim() };
    } catch {
      return { bos: 'NONE', choch: 'NONE', liquiditySweep: 'NONE', orderBlock: 0, summary: 'SMC analysis failed' };
    }
  }

  async analyzeOrderbook(pair: string): Promise<OrderbookAnalysis> {
    try {
      const data = await this.client.getDepth(pair);
      const bids: [number, number][] = (data.buy || []).map((b: [string, string]) => [parseFloat(b[0]), parseFloat(b[1])]);
      const asks: [number, number][] = (data.sell || []).map((s: [string, string]) => [parseFloat(s[0]), parseFloat(s[1])]);

      if (!bids.length || !asks.length) {
        return { bidWallStrength: 50, askWallStrength: 50, hasSpoofWall: false, whaleAbsorbing: false, obScore: 0, summary: 'No depth data' };
      }

      const bidIdr = bids.slice(0, 20).reduce((sum, [p, q]) => sum + p * q, 0);
      const askIdr = asks.slice(0, 20).reduce((sum, [p, q]) => sum + p * q, 0);
      const total = bidIdr + askIdr || 1;

      const bidWallStrength = Math.min(100, (bidIdr / total) * 100);
      const askWallStrength = Math.min(100, (askIdr / total) * 100);

      const maxBidLevel = Math.max(...bids.slice(0, 10).map(([p, q]) => p * q));
      const maxAskLevel = Math.max(...asks.slice(0, 10).map(([p, q]) => p * q));
      const hasSpoofWall = maxBidLevel > bidIdr * 0.4 || maxAskLevel > askIdr * 0.4;

      const whaleAbsorbing = bidWallStrength > 65;

      let obScore = 0;
      if (whaleAbsorbing) obScore += 8;
      else if (bidWallStrength > 50) obScore += 4;
      if (hasSpoofWall) obScore -= 8;
      if (askWallStrength > 70) obScore -= 5;

      const summary = [
        `Bid: ${bidWallStrength.toFixed(0)}% | Ask: ${askWallStrength.toFixed(0)}%`,
        whaleAbsorbing ? 'Whale Absorbing' : '',
        hasSpoofWall ? 'Spoof Wall Detected' : '',
      ].filter(Boolean).join(' | ');

      return { bidWallStrength, askWallStrength, hasSpoofWall, whaleAbsorbing, obScore, summary };
    } catch {
      return { bidWallStrength: 50, askWallStrength: 50, hasSpoofWall: false, whaleAbsorbing: false, obScore: 0, summary: 'Orderbook analysis failed' };
    }
  }

  async calculateATRTargets(pair: string, entryPrice: number): Promise<ATRTargets> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const bars = await this.fetchCandles(pair, '60', now - 20 * 3600, now);

      const atr = bars.length >= 5 ? calculateATR(bars, 14) : entryPrice * 0.03;
      const atrPct = (atr / entryPrice) * 100;
      const sl = entryPrice - 1.5 * atr;
      const tp1 = entryPrice + 1.5 * atr;
      const tp2 = entryPrice + 3.0 * atr;
      const rrRatio = (tp1 - entryPrice) / (entryPrice - sl);

      return { atr, atrPct, sl, tp1, tp2, rrRatio };
    } catch {
      const atr = entryPrice * 0.03;
      return { atr, atrPct: 3, sl: entryPrice - 1.5 * atr, tp1: entryPrice + 1.5 * atr, tp2: entryPrice + 3 * atr, rrRatio: 1 };
    }
  }
}

// Indodax pair → CoinGecko coin ID mapping
const COINGECKO_IDS: Record<string, string> = {
  'btc_idr': 'bitcoin',
  'btc': 'bitcoin',
  'eth_idr': 'ethereum',
  'eth': 'ethereum',
  'sol_idr': 'solana',
  'sol': 'solana',
  'ada_idr': 'cardano',
  'ada': 'cardano',
  'dot_idr': 'polkadot',
  'dot': 'polkadot',
  'avax_idr': 'avalanche-2',
  'avax': 'avalanche-2',
  'matic_idr': 'matic-network',
  'matic': 'matic-network',
  'link_idr': 'chainlink',
  'link': 'chainlink',
  'uni_idr': 'uniswap',
  'uni': 'uniswap',
  'aave_idr': 'aave',
  'cake_idr': 'pancakeswap',
  'cake': 'pancakeswap',
  'doge_idr': 'dogecoin',
  'doge': 'dogecoin',
  'shib_idr': 'shiba-inu',
  'shib': 'shiba-inu',
  'pepe_idr': 'pepe',
  'pepe': 'pepe',
  'xrp_idr': 'ripple',
  'xrp': 'ripple',
  'op_idr': 'optimism',
  'op': 'optimism',
  'arb_idr': 'arbitrum',
  'arb': 'arbitrum',
  'near_idr': 'near',
  'near': 'near',
  'fet_idr': 'fetch-ai',
  'fet': 'fetch-ai',
  'rndr_idr': 'render-token',
  'grt_idr': 'the-graph',
  'grt': 'the-graph',
  'fil_idr': 'filecoin',
  'fil': 'filecoin',
  'theta_idr': 'theta-token',
  'theta': 'theta-token',
  'gala_idr': 'gala',
  'gala': 'gala',
  'axs_idr': 'axie-infinity',
  'axs': 'axie-infinity',
  'sand_idr': 'the-sandbox',
  'sand': 'the-sandbox',
  'mana_idr': 'decentraland',
  'mana': 'decentraland',
  'imx_idr': 'immutable-x',
  'imx': 'immutable-x',
  'bonk_idr': 'bonk',
  'bonk': 'bonk',
  'wif_idr': 'dogwifcoin',
  'wif': 'dogwifcoin',
  'floki_idr': 'floki',
  'floki': 'floki',
  'ondo_idr': 'ondo-finance',
  'ondo': 'ondo-finance',
  'polyx_idr': 'polymesh',
};