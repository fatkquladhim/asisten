import { MarketIntelligence } from './market-intelligence';

export interface SniperSignal {
  type: 'BREAKOUT' | 'RETEST' | 'PANIC_REVERSAL' | 'NONE';
  entryPrice: number;
  confidence: number;
  description: string;
}

export class SniperEntry {
  constructor(private marketIntel: MarketIntelligence) {}

  async scan(pair: string): Promise<SniperSignal> {
    const bars = await this.marketIntel.fetchCandles(pair, '60');
    if (bars.length < 20) return { type: 'NONE', entryPrice: 0, confidence: 0, description: 'Low data' };

    const last = bars[bars.length - 1]!;
    const prev = bars[bars.length - 2]!;

    const resistance = Math.max(...bars.slice(-20, -1).map((b) => b.high));
    if (last.close > resistance && last.volume > prev.volume * 1.5) {
      return {
        type: 'BREAKOUT',
        entryPrice: last.close,
        confidence: 85,
        description: `Breakout resistance ${resistance.toLocaleString()} with volume spike`,
      };
    }

    const oldResistance = Math.max(...bars.slice(-40, -10).map((b) => b.high));
    if (last.low <= oldResistance && last.close > oldResistance && prev.close > oldResistance) {
      return {
        type: 'RETEST',
        entryPrice: last.close,
        confidence: 75,
        description: `Retest old resistance ${oldResistance.toLocaleString()} valid`,
      };
    }

    const drop = (prev.high - prev.low) / prev.high;
    if (drop > 0.05 && last.close > prev.open) {
      return {
        type: 'PANIC_REVERSAL',
        entryPrice: last.close,
        confidence: 70,
        description: `V-Shape recovery after ${(drop * 100).toFixed(1)}% dump`,
      };
    }

    return { type: 'NONE', entryPrice: 0, confidence: 0, description: 'No sniper setup' };
  }
}