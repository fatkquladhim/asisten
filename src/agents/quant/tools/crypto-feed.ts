import { IndodaxClient, IndodaxTicker, IndodaxTradingViewHistory } from './indodax-api';
import { logger } from '@/shared/logger';

export class CryptoFeed {
  constructor(private client: IndodaxClient) {}

  async getTicker(pair: string): Promise<IndodaxTicker> {
    logger.debug({ pair }, 'CryptoFeed.getTicker');
    return this.client.publicRequest<IndodaxTicker>(`/api/ticker/${pair}`);
  }

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
}
