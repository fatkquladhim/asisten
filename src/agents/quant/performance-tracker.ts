import { TradeRepository } from './trade-repository';
import { logger } from '@/shared/logger';

export interface PerformanceReport {
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
  total: TotalStats;
}

export interface PeriodStats {
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnlPerTrade: number;
}

export interface TotalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalFees: number;
  avgPnl: number;
}

export class PerformanceTracker {
  constructor(private repo: TradeRepository) {}

  async getReport(accountId: string): Promise<PerformanceReport> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [daily, weekly, monthly] = await Promise.all([
      this.repo.getStats(accountId, 'day', today),
      this.repo.getStats(accountId, 'week', weekStart),
      this.repo.getStats(accountId, 'month', monthStart),
    ]);

    const toPeriodStats = (s: { tradesCount: number; wins: number; losses: number; totalPnl: number }): PeriodStats => ({
      tradesCount: s.tradesCount,
      wins: s.wins,
      losses: s.losses,
      winRate: s.tradesCount > 0 ? s.wins / s.tradesCount : 0,
      totalPnl: s.totalPnl,
      avgPnlPerTrade: s.tradesCount > 0 ? s.totalPnl / s.tradesCount : 0,
    });

    const allRows = await this.repo.getOpenPositions(accountId);
    const closed = allRows.filter(p => p.status !== 'OPEN');
    const totalPnl = closed.reduce((sum, p) => sum + Number(p.pnlIdr ?? 0), 0);
    const wins = closed.filter(p => Number(p.pnlIdr ?? 0) > 0).length;
    const losses = closed.filter(p => Number(p.pnlIdr ?? 0) < 0).length;

    return {
      daily: toPeriodStats(daily),
      weekly: toPeriodStats(weekly),
      monthly: toPeriodStats(monthly),
      total: {
        totalTrades: closed.length,
        wins, losses,
        winRate: closed.length > 0 ? wins / closed.length : 0,
        totalPnl,
        totalFees: closed.reduce((sum, p) => sum + Number(p.fees ?? 0), 0),
        avgPnl: closed.length > 0 ? totalPnl / closed.length : 0,
      },
    };
  }

  async logReport(accountId: string): Promise<void> {
    const report = await this.getReport(accountId);
    logger.info({
      daily: `${report.daily.totalPnl.toFixed(2)} (${report.daily.tradesCount} trades)`,
      weekly: `${report.weekly.totalPnl.toFixed(2)} (${report.weekly.tradesCount} trades)`,
      monthly: `${report.monthly.totalPnl.toFixed(2)} (${report.monthly.tradesCount} trades)`,
      total: `${report.total.totalPnl.toFixed(2)} (${report.total.totalTrades} trades, ${(report.total.winRate * 100).toFixed(1)}% win)`,
    }, 'Performance report');
  }
}
