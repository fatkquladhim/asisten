import { MarketIntelligence, SMCRawResult } from './market-intelligence';

export interface SMCSignal {
  bos: 'BULLISH' | 'BEARISH' | 'NONE';
  choch: 'BULLISH' | 'BEARISH' | 'NONE';
  liquiditySweep: 'BUY_SIDE' | 'SELL_SIDE' | 'NONE';
  orderBlock: number;
  fvg: boolean;
  premiumDiscount: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  smcScore: number;
  summary: string;
}

export class SMCEngine {
  constructor(private marketIntel: MarketIntelligence) {}

  async analyze(pair: string): Promise<SMCSignal> {
    const rawSMC = await this.marketIntel.analyzeSMC(pair);
    const bars = await this.marketIntel.fetchCandles(pair, '240');

    if (bars.length === 0) {
      return { ...rawSMC, fvg: false, premiumDiscount: 'EQUILIBRIUM', smcScore: 0, summary: 'No 4H Data' };
    }

    let smcScore = 0;
    if (rawSMC.bos === 'BULLISH') smcScore += 20;
    if (rawSMC.choch === 'BULLISH') smcScore += 15;
    if (rawSMC.liquiditySweep === 'SELL_SIDE') smcScore += 25;
    if (rawSMC.orderBlock > 0) smcScore += 10;

    const high = Math.max(...bars.slice(-20).map((b) => b.high));
    const low = Math.min(...bars.slice(-20).map((b) => b.low));
    const mid = (high + low) / 2;
    const current = bars[bars.length - 1]!.close;

    let pd: SMCSignal['premiumDiscount'] = 'EQUILIBRIUM';
    if (current < mid) {
      pd = 'DISCOUNT';
      smcScore += 10;
    } else if (current > mid) {
      pd = 'PREMIUM';
      smcScore -= 5;
    }

    const fvg = this.detectFVG(bars);
    if (fvg) smcScore += 10;

    return {
      ...rawSMC,
      fvg,
      premiumDiscount: pd,
      smcScore,
      summary: `${rawSMC.summary} | PD: ${pd} | FVG: ${fvg ? 'YES' : 'NO'}`,
    };
  }

  private detectFVG(bars: { low: number; high: number; open: number; close: number }[]): boolean {
    if (bars.length < 3) return false;
    const c1 = bars[bars.length - 3]!;
    const c3 = bars[bars.length - 1]!;
    return c3.low > c1.high;
  }
}