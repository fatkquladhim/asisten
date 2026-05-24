import { logger } from '@/shared/logger';

export interface BacktestInput {
  prices: number[];
  buySignal: (index: number, prices: number[]) => boolean;
  sellSignal: (index: number, prices: number[]) => boolean;
  initialCapital?: number;
  feeRate?: number;
}

export interface BacktestResult {
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  finalBalance: number;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const {
    prices,
    buySignal,
    sellSignal,
    initialCapital = 10000,
    feeRate = 0.003,
  } = input;

  logger.debug(
    { dataPoints: prices.length, initialCapital, feeRate },
    'Running backtest',
  );

  let balance = initialCapital;
  let coins = 0;
  let totalTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  let peak = initialCapital;
  let maxDrawdown = 0;

  let inPosition = false;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i]!;

    if (!inPosition && buySignal(i, prices)) {
      const fee = price * feeRate;
      const effectivePrice = price + fee;
      coins = balance / effectivePrice;
      balance = 0;
      inPosition = true;
      totalTrades++;
      continue;
    }

    if (inPosition && sellSignal(i, prices)) {
      const fee = price * feeRate;
      const effectivePrice = price - fee;
      const newBalance = coins * effectivePrice;

      if (newBalance > balance) {
        winningTrades++;
      } else {
        losingTrades++;
      }

      balance = newBalance;
      coins = 0;
      inPosition = false;
      totalTrades++;

      if (balance > peak) {
        peak = balance;
      }

      const drawdown = (peak - balance) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  if (inPosition && prices.length > 0) {
    const lastPrice = prices[prices.length - 1]!;
    const fee = lastPrice * feeRate;
    const effectivePrice = lastPrice - fee;
    const newBalance = coins * effectivePrice;

    if (newBalance > balance) {
      winningTrades++;
    } else {
      losingTrades++;
    }

    balance = newBalance;
    coins = 0;
  }

  const totalReturn = ((balance - initialCapital) / initialCapital) * 100;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    totalTrades,
    winningTrades,
    losingTrades,
    finalBalance: Math.round(balance * 100) / 100,
  };
}
