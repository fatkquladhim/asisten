import { AgentBase } from '@/agents/base';
import { IndodaxClient } from './tools/indodax-api';
import { CryptoFeed } from './tools/crypto-feed';
import { TradeExecutor, TradeParams } from './tools/trade-executor';
import type { ExecutionStep } from '@/shared/types';
import { logger } from '@/shared/logger';

export class QuantAgent extends AgentBase {
  private feed: CryptoFeed;
  private executor: TradeExecutor;

  constructor(private client: IndodaxClient) {
    super();
    this.feed = new CryptoFeed(client);
    this.executor = new TradeExecutor(client);
  }

  override async execute(
    step: ExecutionStep,
    _context: Record<string, unknown>,
  ): Promise<unknown> {
    logger.debug({ action: step.action, params: step.params }, 'QuantAgent.execute');

    switch (step.action) {
      case 'get_price':
      case 'get_ticker': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.feed.getTicker(pair);
      }

      case 'get_ohlcv':
      case 'get_historical_data': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        const tf = (step.params['timeframe'] as string) ?? '60';
        const from = (step.params['from'] as number) ?? Math.floor(Date.now() / 1000) - 86400;
        const to = (step.params['to'] as number) ?? Math.floor(Date.now() / 1000);
        return this.feed.getHistoricalData(pair, tf, from, to);
      }

      case 'execute_trade': {
        const tradeParams: TradeParams = {
          pair: (step.params['pair'] as string) ?? 'btcidr',
          type: (step.params['type'] as 'buy' | 'sell') ?? 'buy',
          price: step.params['price'] as number,
          amount: step.params['amount'] as number,
          amountType: (step.params['amountType'] as 'coin' | 'fiat') ?? 'coin',
        };
        return this.executor.executeTrade(tradeParams);
      }

      default:
        throw new Error(`QuantAgent: unknown action "${step.action}"`);
    }
  }
}
