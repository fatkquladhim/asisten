import { IndodaxClient, IndodaxTicker, IndodaxTradingViewHistory } from './indodax-api';
import { IndodaxMarketWS, MarketChannel } from './indodax-ws';
import { logger } from '@/shared/logger';

export class CryptoFeed {
  private marketWS?: IndodaxMarketWS;
  private latestPrice = new Map<string, { price: number; ts: number }>();

  constructor(private client: IndodaxClient) {}

  async getHistoricalData(
    pair: string,
    tf: string,
    from: number,
    to: number,
  ): Promise<IndodaxTradingViewHistory> {
    logger.debug({ pair, tf, from, to }, 'CryptoFeed.getHistoricalData');

    const symbol = pair.toUpperCase().replace('IDR', 'IDR');

    const query = new URLSearchParams({
      symbol: `INDODAX:${symbol}`,
      resolution: tf,
      from: from.toString(),
      to: to.toString(),
    });

    return this.client.publicRequest<IndodaxTradingViewHistory>(
      `/tradingview/history?${query.toString()}`,
    );
  }

  /**
   * Start real-time Market WS for given pairs (Phase 1 integration).
   * Updates internal latestPrice cache. getTicker() will prefer fresh WS data.
   * Reduces REST polling pressure and enables lower-latency signals.
   */
  async startRealTime(pairs: string[] = ['btcidr']): Promise<void> {
    if (this.marketWS) return;

    this.marketWS = new IndodaxMarketWS();
    await this.marketWS.connect();

    // Subscribe to ticker (chart:tick) and summary for all requested pairs
    for (const p of pairs) {
      const tickCh: MarketChannel = `chart:tick-${p}`;
      this.marketWS.subscribe(tickCh);
      this.marketWS.on(`tick:${p}`, (tick: any) => {
        const price = Number(tick.price);
        if (price > 0) {
          this.latestPrice.set(p, { price, ts: Date.now() });
        }
      });
    }

    // Also global 24h summary (useful for volume/ regime)
    this.marketWS.subscribe('market:summary-24h');
    this.marketWS.on('summary-24h', (rows: any[]) => {
      for (const row of rows) {
        const pair = row[0]?.toLowerCase?.();
        const last = Number(row[2]);
        if (pair && last > 0) {
          this.latestPrice.set(pair, { price: last, ts: Date.now() });
        }
      }
    });

    logger.info({ pairs }, 'CryptoFeed real-time WS started');
  }

  /**
   * getTicker now prefers WS cache (if <30s fresh) for lower latency / rate limit relief.
   * Falls back to REST.
   */
  async getTicker(pair: string): Promise<IndodaxTicker> {
    const cached = this.latestPrice.get(pair);
    if (cached && Date.now() - cached.ts < 30_000) {
      // Return minimal synthetic ticker matching IndodaxTicker shape
      return {
        ticker: {
          high: String(cached.price * 1.002),
          low: String(cached.price * 0.998),
          buy: String(cached.price * 0.999),
          sell: String(cached.price * 1.001),
          last: String(cached.price),
          vol: '0',
          server_time: String(Math.floor(Date.now() / 1000)),
        },
      } as IndodaxTicker;
    }

    logger.debug({ pair }, 'CryptoFeed.getTicker (REST fallback)');
    return this.client.publicRequest<IndodaxTicker>(`/api/ticker/${pair}`);
  }
}
