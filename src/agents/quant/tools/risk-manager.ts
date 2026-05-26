export interface RiskConfig {
  maxPositionSizePercent: number;
  maxDrawdownDailyPercent: number;
}

export class RiskManager {
  private config: RiskConfig;
  private dailyLoss = 0;
  private consecutiveLosses = 0;
  private lastLossTime = 0;
  private readonly STRIKE_COOLDOWN = 2 * 60 * 60 * 1000;
  private lastResetDate: string;

  constructor(config: RiskConfig) {
    this.config = config;
    this.lastResetDate = new Date().toDateString();
  }

  private checkAndResetDailyLoss(): void {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyLoss = 0;
      this.lastResetDate = today;
    }
  }

  validateExecution(askPrice: number, bidPrice: number): boolean {
    const spread = ((askPrice - bidPrice) / bidPrice) * 100;
    if (spread > 0.8) {
      return false;
    }
    return true;
  }

  validateTradeSize(totalBalance: number, tradeAmount: number): boolean {
    const maxAllowed = totalBalance * (this.config.maxPositionSizePercent / 100);
    return tradeAmount <= maxAllowed;
  }

  calculatePositionSize(
    totalBalance: number,
    entryPrice: number,
    stopLoss: number,
    riskPercent: number = 1,
  ): number {
    const riskAmount = totalBalance * (riskPercent / 100);
    const slDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
    if (slDistance <= 0) return 0;

    let optimal = riskAmount / slDistance;
    const maxAllowed = totalBalance * (this.config.maxPositionSizePercent / 100);
    if (optimal > maxAllowed) optimal = maxAllowed;

    return Math.floor(optimal);
  }

  isKillSwitchEngaged(
    totalBalance: number,
    btcDropPercent: number = 0,
    consecutiveApiErrors: number = 0,
  ): { engaged: boolean; reason?: string } {
    this.checkAndResetDailyLoss();

    const maxLoss = totalBalance * (this.config.maxDrawdownDailyPercent / 100);
    if (this.dailyLoss >= maxLoss) {
      return { engaged: true, reason: 'Max daily drawdown reached' };
    }

    if (this.consecutiveLosses >= 3) {
      const elapsed = Date.now() - this.lastLossTime;
      if (elapsed >= this.STRIKE_COOLDOWN) {
        this.consecutiveLosses = 0;
      } else {
        const remaining = Math.ceil((this.STRIKE_COOLDOWN - elapsed) / 60000);
        return { engaged: true, reason: `3-strike rule: cooldown ${remaining}min` };
      }
    }

    if (btcDropPercent <= -3.0) {
      return { engaged: true, reason: `BTC dump ${btcDropPercent.toFixed(2)}%` };
    }

    if (consecutiveApiErrors >= 5) {
      return { engaged: true, reason: '5 consecutive API errors' };
    }

    return { engaged: false };
  }

  recordLoss(lossAmount: number): void {
    this.checkAndResetDailyLoss();
    this.dailyLoss += lossAmount;
    this.consecutiveLosses += 1;
    this.lastLossTime = Date.now();
  }

  recordWin(): void {
    this.consecutiveLosses = 0;
  }

  validateCorrelation(pair: string, openPairs: string[]): boolean {
    const categories: Record<string, string[]> = {
      MEME: ['pepe_idr', 'doge_idr', 'shib_idr', 'floki_idr', 'bonk_idr', 'wif_idr'],
      AI: ['fet_idr', 'near_idr', 'grt_idr', 'ocean_idr'],
      L1: ['btc_idr', 'eth_idr', 'sol_idr', 'ada_idr', 'avax_idr', 'dot_idr'],
    };

    for (const [name, coins] of Object.entries(categories)) {
      if (coins.includes(pair.toLowerCase())) {
        const sameCategory = openPairs.filter((p) => coins.includes(p.toLowerCase()));
        if (sameCategory.length >= 2) {
          return false;
        }
      }
    }

    return true;
  }
}