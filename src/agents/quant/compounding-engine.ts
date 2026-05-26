import { logger } from '@/shared/logger';

export interface CompoundingConfig {
  initialBalance: number;
  currentBalance: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  reinvestRatio: number;
}

export interface PositionSizeResult {
  riskAmount: number;
  positionSize: number;
  riskPercent: number;
  kellyFraction: number;
}

export class CompoundingEngine {
  private static readonly DEFAULT_RISK_PCT = 1;
  private static readonly MAX_RISK_PCT = 3;
  private static readonly MIN_RISK_PCT = 0.25;

  static kellyCriterion(winRate: number, avgWin: number, avgLoss: number): number {
    if (avgLoss <= 0 || winRate <= 0 || winRate >= 1) return 0;
    const b = avgWin / Math.abs(avgLoss);
    const kelly = (winRate * b - (1 - winRate)) / b;
    return Math.max(0, Math.min(kelly, 0.25));
  }

  static calculatePositionSize(config: CompoundingConfig): PositionSizeResult {
    const kelly = this.kellyCriterion(config.winRate, config.avgWinPercent, config.avgLossPercent);
    const totalRiskPct = this.DEFAULT_RISK_PCT + kelly * 2;
    const clampedRiskPct = Math.max(this.MIN_RISK_PCT, Math.min(totalRiskPct, this.MAX_RISK_PCT));
    const riskAmount = config.currentBalance * (clampedRiskPct / 100);
    logger.debug(
      { kelly: kelly.toFixed(4), riskPct: clampedRiskPct.toFixed(2), riskAmount: riskAmount.toFixed(2) },
      'CompoundingEngine position size',
    );
    return {
      riskAmount,
      positionSize: 0,
      riskPercent: clampedRiskPct,
      kellyFraction: kelly,
    };
  }

  static calculateReinvest(
    currentBalance: number,
    initialBalance: number,
    targetAllocation: number,
  ): { reinvestAmount: number; withdrawAmount: number; bufferAmount: number } {
    const profit = currentBalance - initialBalance;
    if (profit <= 0) {
      return { reinvestAmount: 0, withdrawAmount: 0, bufferAmount: currentBalance };
    }
    const reinvestAmount = profit * targetAllocation;
    const withdrawAmount = profit * (1 - targetAllocation);
    const bufferAmount = initialBalance + reinvestAmount;
    return { reinvestAmount, withdrawAmount, bufferAmount };
  }

  static getRiskMultiplier(currentBalance: number, initialBalance: number): number {
    if (initialBalance <= 0) return 1;
    const ratio = currentBalance / initialBalance;
    if (ratio <= 1) return 0.5;
    if (ratio <= 1.5) return 0.75;
    if (ratio <= 2) return 1;
    if (ratio <= 3) return 1.25;
    if (ratio <= 5) return 1.5;
    return 2;
  }
}
