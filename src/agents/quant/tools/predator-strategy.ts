export type PredatorAction = 'MARKET_BUY' | 'LIMIT_ENTRY' | 'SNIPER_WATCHLIST' | 'SKIP';

export type MarketRegime = 'PREDATOR' | 'WAR' | 'DEFENSE' | 'NEUTRAL';

export interface TradeTargets {
  sl: number;
  tp1: number;
  tp2: number;
  tp3?: number;
}

export interface PredatorResult {
  shouldBuy: boolean;
  action: PredatorAction;
  reason: string;
  score: number;
  targets?: TradeTargets;
  sizeMultiplier?: number;
}

export interface PredatorInput {
  aiConsensusScore: number;
  smcScore: number;
  narrativeScore: number;
  sniperConfidence: number;
  whaleActive: boolean;
  memeBoost: number;
  alphaHunterScore: number;
  entryPrice: number;
  atrTargets: TradeTargets;
}

export class PredatorStrategy {
  private static readonly SMC_MAX = 80;

  static evaluate(input: PredatorInput, regime: MarketRegime = 'NEUTRAL'): PredatorResult {
    const dims = [
      Math.min(input.aiConsensusScore, 100),
      Math.min(input.smcScore, this.SMC_MAX),
      Math.min(input.narrativeScore, 100),
      Math.min(input.sniperConfidence, 100),
      input.whaleActive ? 80 : 0,
      Math.min(input.memeBoost, 100),
      Math.min(input.alphaHunterScore, 100),
    ].sort((a, b) => b - a);
    const top4 = dims.slice(0, 4);
    const avgTop4 = top4.reduce((s, v) => s + v, 0) / top4.length;

    let finalScore = avgTop4;

    if (regime === 'PREDATOR') finalScore = Math.min(100, finalScore + 5);
    if (regime === 'WAR') finalScore = Math.min(100, finalScore + 8);
    if (regime === 'DEFENSE') finalScore = Math.max(0, finalScore - 5);

    const marketBuyThreshold = regime === 'PREDATOR' ? 60 : 55;
    const limitEntryThreshold = regime === 'DEFENSE' ? 32 : 38;

    if (finalScore >= marketBuyThreshold) {
      return {
        shouldBuy: true,
        action: 'MARKET_BUY',
        reason: `ELITE (100% size): High confidence score ${finalScore.toFixed(0)}`,
        score: finalScore,
        targets: input.atrTargets,
        sizeMultiplier: 1.0,
      };
    }

    if (finalScore >= limitEntryThreshold) {
      return {
        shouldBuy: true,
        action: 'LIMIT_ENTRY',
        reason: `PRO (50% size): Good setup score ${finalScore.toFixed(0)}`,
        score: finalScore,
        targets: input.atrTargets,
        sizeMultiplier: 0.5,
      };
    }

    return {
      shouldBuy: false,
      action: finalScore >= 20 ? 'SNIPER_WATCHLIST' : 'SKIP',
      reason: finalScore >= 20
        ? `WATCH: Score ${finalScore.toFixed(0)} — below entry threshold`
        : `SKIP: Score ${finalScore.toFixed(0)} — weak alpha`,
      score: finalScore,
    };
  }
}