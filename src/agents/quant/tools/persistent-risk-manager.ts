import Redis from 'ioredis';
import { logger } from '@/shared/logger';
import { env } from '@/config/index';

export interface RiskConfig {
  maxPositionSizePercent: number;
  maxDrawdownDailyPercent: number;
}

/**
 * PersistentRiskManager — wraps RiskManager with Redis-backed state.
 * Fixes the critical bug: RiskManager state reset every cycle.
 * Used by QuantAgent singleton (not recreated each cycle).
 */
export class PersistentRiskManager {
  private redis: Redis;
  private readonly STATE_KEY = 'risk:state';
  private config: RiskConfig;
  private readonly STRIKE_COOLDOWN = 2 * 60 * 60 * 1000;

  constructor(config: RiskConfig) {
    this.redis = new Redis(env.REDIS_URL);
    this.config = config;
  }

  private getTodayKey(): string {
    return new Date().toDateString();
  }

  async checkAndResetDailyLoss(): Promise<void> {
    const today = this.getTodayKey();
    const lastDate = await this.redis.hget(this.STATE_KEY, 'lastDate');
    if (lastDate !== today) {
      await this.redis.hset(this.STATE_KEY, 'dailyLoss', 0);
      await this.redis.hset(this.STATE_KEY, 'lastDate', today);
    }
  }

  async validateExecution(askPrice: number, bidPrice: number): Promise<boolean> {
    const spread = ((askPrice - bidPrice) / bidPrice) * 100;
    return spread <= 0.8;
  }

  async validateTradeSize(totalBalance: number, tradeAmount: number): Promise<boolean> {
    const maxAllowed = totalBalance * (this.config.maxPositionSizePercent / 100);
    return tradeAmount <= maxAllowed;
  }

  async calculatePositionSize(
    totalBalance: number,
    entryPrice: number,
    stopLoss: number,
    riskPercent: number = 1,
  ): Promise<number> {
    const riskAmount = totalBalance * (riskPercent / 100);
    const slDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
    if (slDistance <= 0) return 0;

    let optimal = riskAmount / slDistance;
    const maxAllowed = totalBalance * (this.config.maxPositionSizePercent / 100);
    if (optimal > maxAllowed) optimal = maxAllowed;

    return Math.floor(optimal);
  }

  async isKillSwitchEngaged(
    totalBalance: number,
    btcDropPercent: number = 0,
    consecutiveApiErrors: number = 0,
  ): Promise<{ engaged: boolean; reason?: string }> {
    await this.checkAndResetDailyLoss();

    const dailyLossRaw = await this.redis.hget(this.STATE_KEY, 'dailyLoss');
    const dailyLoss = dailyLossRaw ? parseFloat(dailyLossRaw) : 0;
    const maxLoss = totalBalance * (this.config.maxDrawdownDailyPercent / 100);
    if (dailyLoss >= maxLoss) {
      return { engaged: true, reason: 'Max daily drawdown reached' };
    }

    const consecutiveLossesRaw = await this.redis.hget(this.STATE_KEY, 'consecutiveLosses');
    const consecutiveLosses = consecutiveLossesRaw ? parseInt(consecutiveLossesRaw, 10) : 0;
    if (consecutiveLosses >= 3) {
      const lastLossTimeRaw = await this.redis.hget(this.STATE_KEY, 'lastLossTime');
      const lastLossTime = lastLossTimeRaw ? parseInt(lastLossTimeRaw, 10) : 0;
      const elapsed = Date.now() - lastLossTime;
      if (elapsed < this.STRIKE_COOLDOWN) {
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

  async recordLoss(lossAmount: number): Promise<void> {
    await this.checkAndResetDailyLoss();
    await this.redis.hincrbyfloat(this.STATE_KEY, 'dailyLoss', lossAmount);
    await this.redis.hincrby(this.STATE_KEY, 'consecutiveLosses', 1);
    await this.redis.hset(this.STATE_KEY, 'lastLossTime', Date.now());
  }

  async recordWin(): Promise<void> {
    await this.redis.hset(this.STATE_KEY, 'consecutiveLosses', 0);
  }

  async validateCorrelation(pair: string, openPairs: string[]): Promise<boolean> {
    const categories: Record<string, string[]> = {
      MEME: ['pepe_idr', 'doge_idr', 'shib_idr', 'floki_idr', 'bonk_idr', 'wif_idr'],
      AI: ['fet_idr', 'near_idr', 'grt_idr', 'ocean_idr'],
      L1: ['btc_idr', 'eth_idr', 'sol_idr', 'ada_idr', 'avax_idr', 'dot_idr'],
    };

    for (const coins of Object.values(categories)) {
      if (coins.includes(pair.toLowerCase())) {
        const sameCategory = openPairs.filter((p) => coins.includes(p.toLowerCase()));
        if (sameCategory.length >= 2) {
          return false;
        }
      }
    }

    return true;
  }

  async close(): Promise<void> {
    await this.redis.quit();
    logger.debug('PersistentRiskManager Redis connection closed');
  }
}