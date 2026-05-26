export interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function calculateSMA(prices: number[], period: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j]!;
    }
    result.push(sum / period);
  }

  return result;
}

export function calculateRSI(prices: number[], period: number): number[] {
  const result: number[] = [];

  if (prices.length < period + 1) {
    return prices.map(() => NaN);
  }

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      result.push(NaN);
      continue;
    }

    let gainSum = 0;
    let lossSum = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const diff = prices[j]! - prices[j - 1]!;
      if (diff > 0) {
        gainSum += diff;
      } else {
        lossSum += Math.abs(diff);
      }
    }

    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;

    if (avgLoss === 0) {
      result.push(100);
      continue;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push(rsi);
  }

  return result;
}

/** EMA: Exponential Moving Average (standard formula) */
export function calculateEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  if (prices.length < period) return prices.map(() => NaN);

  let prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(NaN); // index 0 placeholder, actual first ema at index period-1
  for (let i = 1; i < period; i++) result.push(NaN);
  result[period - 1] = prev;

  for (let i = period; i < prices.length; i++) {
    prev = prices[i]! * k + prev * (1 - k);
    result.push(prev);
  }

  return result;
}

/** Wilder's Smoothed RSI (more responsive than SMA-based RSI) */
export function calculateWilderRSI(prices: number[], period: number = 14): number {
  if (prices.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i]! - prices[i - 1]!;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i]! - prices[i - 1]!;
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** ATR — Average True Range (Wilder's smoothed) */
export function calculateATR(bars: OHLCBar[], period: number = 14): number {
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i]!.high - bars[i]!.low,
      Math.abs(bars[i]!.high - bars[i - 1]!.close),
      Math.abs(bars[i]!.low  - bars[i - 1]!.close),
    );
    trueRanges.push(tr);
  }
  if (trueRanges.length === 0) return 0;

  const firstATR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, trueRanges.length);
  let atr = firstATR;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]!) / period;
  }
  return atr;
}

/** Trend detection using EMA7/14 crossover (last 14 bars) */
export function detectTrend(bars: OHLCBar[]): 'UP' | 'DOWN' | 'SIDEWAYS' {
  if (bars.length < 5) return 'SIDEWAYS';
  const closes = bars.map((b) => b.close);
  const ema7 = calculateEMA(closes, 7);
  const ema14 = calculateEMA(closes, 14);

  const lastEma7 = ema7[ema7.length - 1]!;
  const lastEma14 = ema14[ema14.length - 1]!;
  const prevEma7 = ema7[ema7.length - 2] ?? lastEma7;
  const prevEma14 = ema14[ema14.length - 2] ?? lastEma14;

  if (lastEma7 > lastEma14 && lastEma7 > prevEma7) return 'UP';
  if (lastEma7 < lastEma14 && lastEma7 < prevEma7) return 'DOWN';
  return 'SIDEWAYS';
}
