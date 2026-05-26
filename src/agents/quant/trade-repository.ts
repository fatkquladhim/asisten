import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { getDb } from '@/config/database';
import { positions, tradingStats, dcaConfigs } from '@/db/schema/trading';
import { accounts } from '@/db/schema/finance';
import { logger } from '@/shared/logger';

export interface CreatePositionInput {
  accountId: string;
  pair: string;
  side: 'buy' | 'sell';
  quantity: string;
  entryPrice: string;
  stopLoss?: string;
  takeProfit1?: string;
  takeProfit2?: string;
  takeProfit3?: string;
  strategyId?: string;
  isPaper?: boolean;
}

export interface PositionRow {
  id: string;
  accountId: string;
  pair: string;
  side: string;
  quantity: string;
  entryPrice: string;
  currentStopLoss: string | null;
  originalStopLoss: string | null;
  takeProfit1: string | null;
  takeProfit2: string | null;
  takeProfit3: string | null;
  tpsHit: number[];
  highestPrice: string | null;
  fees: string;
  strategyId: string | null;
  isPaper: boolean;
  status: string;
  pnlIdr: string | null;
  pnlPercent: string | null;
  exitPrice: string | null;
  exitReason: string | null;
  openedAt: Date;
  closedAt: Date | null;
  holdMinutes: number | null;
}

export type PositionStatus = 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'CLOSED_SL' | 'CLOSED_TP' | 'CLOSED_MANUAL' | 'CLOSED_TIME';

export class TradeRepository {
  async getDefaultAccount(): Promise<string | null> {
    const rows = await getDb().select({ id: accounts.id }).from(accounts).limit(1);
    return rows[0]?.id ?? null;
  }

  async getAccountBalance(accountId: string): Promise<number> {
    const rows = await getDb().select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
    return rows[0]?.balance ? Number(rows[0].balance) : 1000000;
  }

  async createPosition(input: CreatePositionInput): Promise<PositionRow> {
    const rows = await getDb().insert(positions).values({
      accountId: input.accountId,
      pair: input.pair,
      side: input.side,
      quantity: input.quantity,
      entryPrice: input.entryPrice,
      currentStopLoss: input.stopLoss ?? null,
      originalStopLoss: input.stopLoss ?? null,
      takeProfit1: input.takeProfit1 ?? null,
      takeProfit2: input.takeProfit2 ?? null,
      takeProfit3: input.takeProfit3 ?? null,
      highestPrice: input.entryPrice,
      strategyId: input.strategyId ?? null,
      isPaper: input.isPaper ?? true,
    }).returning();
    const row = rows[0]!;
    logger.info({ id: row.id, pair: input.pair }, 'Position created');
    return this.mapRow(row);
  }

  async getOpenPositions(accountId: string): Promise<PositionRow[]> {
    const rows = await getDb().select().from(positions)
      .where(and(eq(positions.accountId, accountId), eq(positions.status, 'OPEN')))
      .orderBy(asc(positions.openedAt));
    return rows.map(this.mapRow);
  }

  async getOpenPosition(pair: string, accountId: string): Promise<PositionRow | null> {
    const rows = await getDb().select().from(positions)
      .where(and(eq(positions.accountId, accountId), eq(positions.pair, pair), eq(positions.status, 'OPEN')))
      .limit(1);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async updatePosition(id: string, updates: Partial<{
    currentStopLoss: string;
    highestPrice: string;
    tpsHit: number[];
    status: PositionStatus;
    pnlIdr: string;
    pnlPercent: string;
    exitPrice: string;
    exitReason: string;
    closedAt: Date;
    holdMinutes: number;
  }>): Promise<void> {
    await getDb().update(positions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(positions.id, id));
  }

  async closePosition(
    id: string,
    currentPrice: string,
    reason: PositionStatus,
  ): Promise<void> {
    const [row] = await getDb().select().from(positions).where(eq(positions.id, id)).limit(1);
    if (!row) return;
    const entry = Number(row.entryPrice);
    const current = Number(currentPrice);
    const side = row.side;
    const rawPnl = side === 'buy' ? (current - entry) / entry : (entry - current) / entry;
    const pnlPercent = rawPnl * 100;
    const quantity = Number(row.quantity);
    const pnlIdr = side === 'buy'
      ? (current - entry) * quantity
      : (entry - current) * quantity;
    const now = new Date();
    const holdMinutes = Math.round((now.getTime() - new Date(row.openedAt).getTime()) / 60000);
    await getDb().update(positions)
      .set({
        status: reason,
        pnlIdr: String(pnlIdr),
        pnlPercent: String(pnlPercent),
        exitPrice: currentPrice,
        exitReason: reason,
        closedAt: now,
        holdMinutes,
        updatedAt: now,
      })
      .where(eq(positions.id, id));
    logger.info({ id, pair: row.pair, pnlPercent: pnlPercent.toFixed(2), reason }, 'Position closed');
  }

  async getOpenPairs(accountId: string): Promise<string[]> {
    const rows = await getDb().select({ pair: positions.pair }).from(positions)
      .where(and(eq(positions.accountId, accountId), eq(positions.status, 'OPEN')));
    return rows.map(r => r.pair);
  }

  async getStats(
    accountId: string,
    period: string,
    periodStart: Date,
  ): Promise<{
    tradesCount: number; wins: number; losses: number; totalPnl: number; totalFees: number;
  }> {
    const endDate = new Date(periodStart);
    if (period === 'day') endDate.setDate(endDate.getDate() + 1);
    else if (period === 'week') endDate.setDate(endDate.getDate() + 7);
    else if (period === 'month') endDate.setMonth(endDate.getMonth() + 1);
    const rows = await getDb().select().from(positions)
      .where(and(
        eq(positions.accountId, accountId),
        sql`${positions.status} != 'OPEN'`,
        sql`${positions.closedAt} >= ${periodStart}`,
        sql`${positions.closedAt} < ${endDate}`,
      ));
    let wins = 0; let losses = 0; let totalPnl = 0; let totalFees = 0;
    for (const r of rows) {
      const pnl = Number(r.pnlIdr ?? 0);
      totalPnl += pnl;
      totalFees += Number(r.fees ?? 0);
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
    }
    return {
      tradesCount: rows.length,
      wins, losses, totalPnl, totalFees,
    };
  }

  async upsertStats(accountId: string, period: string, periodStart: Date): Promise<void> {
    const stats = await this.getStats(accountId, period, periodStart);
    const existing = await getDb().select({ id: tradingStats.id }).from(tradingStats)
      .where(and(
        eq(tradingStats.accountId, accountId),
        eq(tradingStats.period, period),
        eq(tradingStats.periodStart, periodStart),
      ))
      .limit(1);
    const winRate = stats.tradesCount > 0 ? stats.wins / stats.tradesCount : 0;
    const values = {
      tradesCount: stats.tradesCount,
      wins: stats.wins,
      losses: stats.losses,
      totalPnl: String(stats.totalPnl),
      totalFees: String(stats.totalFees),
      winRate: String(winRate),
    };
    if (existing[0]) {
      await getDb().update(tradingStats).set(values).where(eq(tradingStats.id, existing[0].id));
    } else {
      await getDb().insert(tradingStats).values({
        accountId,
        period,
        periodStart,
        ...values,
      });
    }
  }

  async getDCAConfigs(accountId: string): Promise<{
    id: string; pair: string; isActive: boolean; dailyAmount: string;
    minutesInterval: number; strategy: string; nextExecution: Date | null;
  }[]> {
    const rows = await getDb().select().from(dcaConfigs)
      .where(and(eq(dcaConfigs.accountId, accountId), eq(dcaConfigs.isActive, true)));
    return rows.map(r => ({
      id: r.id,
      pair: r.pair,
      isActive: r.isActive,
      dailyAmount: r.dailyAmount,
      minutesInterval: r.minutesInterval,
      strategy: r.strategy,
      nextExecution: r.nextExecution,
    }));
  }

  async updateDCAExecution(id: string): Promise<void> {
    const now = new Date();
    await getDb().update(dcaConfigs).set({
      lastExecuted: now,
      nextExecution: new Date(now.getTime() + 1440 * 60000),
    }).where(eq(dcaConfigs.id, id));
  }

  private mapRow(row: typeof positions.$inferSelect): PositionRow {
    return {
      id: row.id,
      accountId: row.accountId,
      pair: row.pair,
      side: row.side,
      quantity: row.quantity,
      entryPrice: row.entryPrice,
      currentStopLoss: row.currentStopLoss,
      originalStopLoss: row.originalStopLoss,
      takeProfit1: row.takeProfit1,
      takeProfit2: row.takeProfit2,
      takeProfit3: row.takeProfit3,
      tpsHit: row.tpsHit ?? [],
      highestPrice: row.highestPrice,
      fees: row.fees,
      strategyId: row.strategyId,
      isPaper: row.isPaper,
      status: row.status,
      pnlIdr: row.pnlIdr,
      pnlPercent: row.pnlPercent,
      exitPrice: row.exitPrice,
      exitReason: row.exitReason,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      holdMinutes: row.holdMinutes,
    };
  }
}
