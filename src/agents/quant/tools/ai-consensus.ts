export interface AIResult {
  pair: string;
  action: 'BUY' | 'SELL' | 'AVOID';
  score: number;
  regime: string;
  confidence: 'HIGH' | 'MID' | 'LOW';
  precise_entry: number | null;
  precise_sl: number | null;
  precise_tp: number | null;
  why_now: string;
}

export interface ConsensusResult {
  finalScore: number;
  action: 'BUY' | 'WATCHLIST' | 'WAIT' | 'AVOID';
  isManipulated: boolean;
  summary: string;
}

export class AIConsensus {
  static calculate(results: AIResult[]): ConsensusResult {
    if (results.length === 0) {
      return { finalScore: 0, action: 'AVOID', isManipulated: false, summary: 'No signals' };
    }

    const scores = results.map((r) => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const variance = maxScore - minScore;
    const isManipulated = variance > 40;

    let action: ConsensusResult['action'] = 'AVOID';
    if (avgScore >= 75) action = 'BUY';
    else if (avgScore >= 60) action = 'WATCHLIST';
    else if (avgScore >= 45) action = 'WAIT';
    else action = 'AVOID';

    if (isManipulated) {
      action = 'WAIT';
    }

    return {
      finalScore: Math.round(avgScore),
      action,
      isManipulated,
      summary: `Avg: ${avgScore.toFixed(0)} | Var: ${variance} | ${isManipulated ? 'FAKE MOVE ALERT' : 'CONSENSUS OK'}`,
    };
  }
}