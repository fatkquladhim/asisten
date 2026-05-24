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
