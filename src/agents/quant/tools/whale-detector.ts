import { MarketIntelligence } from './market-intelligence';

export interface WhaleActivity {
  pair: string;
  isWhaleActive: boolean;
  spikeMagnitude: number;
  lastBigVolIdr: number;
}

export class WhaleDetector {
  constructor(private marketIntel: MarketIntelligence) {}

  async detect(pair: string): Promise<WhaleActivity> {
    try {
      const bars = await this.marketIntel.fetchCandles(pair, '60');
      if (bars.length < 24) {
        return { pair, isWhaleActive: false, spikeMagnitude: 0, lastBigVolIdr: 0 };
      }

      const lastBar = bars[bars.length - 1]!;
      const prevBars = bars.slice(-24, -1);
      const avgVol = prevBars.reduce((sum, b) => sum + b.volume, 0) / prevBars.length;

      const spikeMagnitude = lastBar.volume / (avgVol || 1);
      const isWhaleActive = spikeMagnitude >= 3.0;

      return { pair, isWhaleActive, spikeMagnitude, lastBigVolIdr: lastBar.volume };
    } catch {
      return { pair, isWhaleActive: false, spikeMagnitude: 0, lastBigVolIdr: 0 };
    }
  }
}