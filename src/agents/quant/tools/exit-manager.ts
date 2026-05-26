export interface ExitPlan {
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
}

export interface PositionUpdate {
  shouldClose: boolean;
  closeReason?: string;
  newSL?: number;
  tpHit?: number;
}

export class ExitManager {
  static calculateInitialPlan(entry: number): ExitPlan {
    return {
      tp1: entry * 1.10,
      tp2: entry * 1.20,
      tp3: entry * 1.35,
      sl: entry * 0.96,
    };
  }

  static monitor(
    currentPrice: number,
    entryPrice: number,
    currentSL: number,
    tpsHit: number[],
    entryTimestamp?: number,
  ): PositionUpdate {
    const profitPct = (currentPrice - entryPrice) / entryPrice;

    if (entryTimestamp) {
      const ageHours = (Date.now() - entryTimestamp) / 3600000;
      if (ageHours > 48 && profitPct < 0.01) {
        return { shouldClose: true, closeReason: 'TIME_EXIT_48H' };
      }
    }

    if (currentPrice <= currentSL) {
      return { shouldClose: true, closeReason: 'STOP_LOSS' };
    }

    if (profitPct >= 0.05 && currentSL < entryPrice) {
      return { shouldClose: false, newSL: entryPrice * 1.005, closeReason: 'MOVE_TO_BEP' };
    }

    if (profitPct >= 0.10 && currentSL < entryPrice * 1.04) {
      return { shouldClose: false, newSL: entryPrice * 1.04, closeReason: 'TRAILING_STOP' };
    }

    const plan = this.calculateInitialPlan(entryPrice);
    if (currentPrice >= plan.tp1 && !tpsHit.includes(1)) {
      return { shouldClose: false, tpHit: 1, closeReason: 'TP1_HIT' };
    }
    if (currentPrice >= plan.tp2 && !tpsHit.includes(2)) {
      return { shouldClose: false, tpHit: 2, closeReason: 'TP2_HIT' };
    }
    if (currentPrice >= plan.tp3 && !tpsHit.includes(3)) {
      return { shouldClose: true, tpHit: 3, closeReason: 'TP3_FULL_EXIT' };
    }

    return { shouldClose: false };
  }
}