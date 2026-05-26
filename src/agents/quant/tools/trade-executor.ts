import { IndodaxClient } from './indodax-api';
import { logger } from '@/shared/logger';

export interface TradeParams {
  pair: string;
  type: 'buy' | 'sell';
  price: number;
  amount: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  receive?: string;
  remainder?: string;
  balance?: Record<string, string>;
  error?: string;
}

export class TradeExecutor {
  constructor(private client: IndodaxClient) {}

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    logger.debug(
      { pair: params.pair, type: params.type, price: params.price, amount: params.amount },
      'TradeExecutor.executeTrade',
    );

    try {
      const result = await this.client.trade(params.pair, params.type, params.price, params.amount);

      logger.info(
        { orderId: result.order_id, receive: result.receive },
        'Trade executed successfully',
      );

      return {
        success: true,
        orderId: result.order_id,
        receive: result.receive,
        remainder: result.remainder,
        balance: result.balance,
      };
    } catch (err) {
      const message = (err as Error).message;
      logger.error({ error: message, params }, 'Trade execution failed');
      return { success: false, error: message };
    }
  }
}
