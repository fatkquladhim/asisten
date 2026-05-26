import { MarketIntelligence } from './market-intelligence';

const MEME_LIST = [
  'zerebro_idr', 'pump_idr', 'pippin_idr', 'fartcoin_idr',
  'moodeng_idr', 'doge_idr', 'shib_idr', 'pepe_idr',
  'bonk_idr', 'wif_idr', 'pengu_idr', 'floki_idr',
  'brett_idr', 'popcat_idr', 'neiro_idr', 'turbo_idr',
];

export class MemeRadar {
  constructor(private marketIntel: MarketIntelligence) {}

  async analyzeMemeRotation(): Promise<{ topMemes: string[]; boosts: Record<string, number> }> {
    const boosts: Record<string, number> = {};
    const candidates: string[] = [];

    for (const pair of MEME_LIST) {
      const bars = await this.marketIntel.fetchCandles(pair, '60');
      if (bars.length < 5) continue;

      const lastBar = bars[bars.length - 1]!;
      const prevBars = bars.slice(-20, -1);
      const avgVol = prevBars.reduce((sum, b) => sum + b.volume, 0) / (prevBars.length || 1);

      if (lastBar.volume > avgVol * 2) {
        boosts[pair] = 20;
        candidates.push(pair);
      }

      const high = Math.max(...prevBars.map((b) => b.high));
      if (lastBar.close > high) {
        boosts[pair] = (boosts[pair] || 0) + 15;
        if (!candidates.includes(pair)) candidates.push(pair);
      }
    }

    return {
      topMemes: candidates.sort((a, b) => (boosts[b] || 0) - (boosts[a] || 0)),
      boosts,
    };
  }

  static isMeme(pair: string): boolean {
    return MEME_LIST.includes(pair.toLowerCase());
  }
}