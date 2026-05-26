import {
  pgTable, uuid, varchar, numeric, timestamp, boolean, integer, index,
} from 'drizzle-orm/pg-core';
import { accounts } from './finance';

export const positions = pgTable('positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  pair: varchar('pair', { length: 20 }).notNull(),
  side: varchar('side', { length: 10 }).notNull(),
  quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
  entryPrice: numeric('entry_price', { precision: 20, scale: 8 }).notNull(),
  currentStopLoss: numeric('current_stop_loss', { precision: 20, scale: 8 }),
  originalStopLoss: numeric('original_stop_loss', { precision: 20, scale: 8 }),
  takeProfit1: numeric('take_profit1', { precision: 20, scale: 8 }),
  takeProfit2: numeric('take_profit2', { precision: 20, scale: 8 }),
  takeProfit3: numeric('take_profit3', { precision: 20, scale: 8 }),
  tpsHit: integer('tps_hit').array().default([]).notNull(),
  highestPrice: numeric('highest_price', { precision: 20, scale: 8 }),
  fees: numeric('fees', { precision: 20, scale: 8 }).default('0').notNull(),
  strategyId: uuid('strategy_id'),
  isPaper: boolean('is_paper').default(true).notNull(),
  status: varchar('status', { length: 30 }).default('OPEN').notNull(),
  pnlIdr: numeric('pnl_idr', { precision: 20, scale: 8 }),
  pnlPercent: numeric('pnl_percent', { precision: 10, scale: 4 }),
  exitPrice: numeric('exit_price', { precision: 20, scale: 8 }),
  exitReason: varchar('exit_reason', { length: 50 }),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  holdMinutes: integer('hold_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountStatusIdx: index('positions_account_status_idx').on(table.accountId, table.status),
  pairStatusIdx: index('positions_pair_status_idx').on(table.pair, table.status),
}));

export const tradingStats = pgTable('trading_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  period: varchar('period', { length: 10 }).notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  tradesCount: integer('trades_count').default(0).notNull(),
  wins: integer('wins').default(0).notNull(),
  losses: integer('losses').default(0).notNull(),
  totalPnl: numeric('total_pnl', { precision: 20, scale: 8 }).default('0').notNull(),
  totalFees: numeric('total_fees', { precision: 20, scale: 8 }).default('0').notNull(),
  winRate: numeric('win_rate', { precision: 6, scale: 4 }),
  largestWin: numeric('largest_win', { precision: 20, scale: 8 }),
  largestLoss: numeric('largest_loss', { precision: 20, scale: 8 }),
  avgHoldMinutes: numeric('avg_hold_minutes', { precision: 10, scale: 2 }),
}, (table) => ({
  accountPeriodIdx: index('stats_account_period_idx').on(table.accountId, table.period, table.periodStart),
}));

export const dcaConfigs = pgTable('dca_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  pair: varchar('pair', { length: 20 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  dailyAmount: numeric('daily_amount', { precision: 20, scale: 2 }).notNull(),
  minutesInterval: integer('minutes_interval').default(1440).notNull(),
  strategy: varchar('strategy', { length: 20 }).default('FIXED').notNull(),
  lastExecuted: timestamp('last_executed', { withTimezone: true }),
  nextExecution: timestamp('next_execution', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountActiveIdx: index('dca_account_active_idx').on(table.accountId, table.isActive),
}));
