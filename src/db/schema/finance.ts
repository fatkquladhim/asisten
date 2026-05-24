import {
  pgTable, uuid, varchar, text, jsonb, timestamp, numeric, boolean, index,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  platform: varchar('platform', { length: 100 }),
  balance: numeric('balance', { precision: 20, scale: 8 }).default('0').notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  meta: jsonb('meta').$type<{
    apiKeyRef?: string;
    address?: string;
    isPaperTrading?: boolean;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tradeExecutions = pgTable('trade_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  side: varchar('side', { length: 10 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
  price: numeric('price', { precision: 20, scale: 8 }),
  fee: numeric('fee', { precision: 20, scale: 8 }),
  pnl: numeric('pnl', { precision: 20, scale: 8 }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  strategyId: uuid('strategy_id'),
  exchangeOrderId: varchar('exchange_order_id', { length: 100 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountSymbolIdx: index('trades_account_symbol_idx').on(table.accountId, table.symbol),
}));

export const strategies = pgTable('strategies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  config: jsonb('config').$type<{
    indicators: string[];
    interval: string;
    riskPerTrade: number;
    takeProfit: number;
    stopLoss: number;
    maxPositionSize: number;
  }>(),
  backtestResults: jsonb('backtest_results').$type<{
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  }>(),
  isActive: boolean('is_active').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  tradeId: uuid('trade_id').references(() => tradeExecutions.id),
  type: varchar('type', { length: 30 }).notNull(),
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
  balanceBefore: numeric('balance_before', { precision: 20, scale: 8 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 20, scale: 8 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountTimeIdx: index('ledger_account_time_idx').on(table.accountId, table.createdAt),
}));
