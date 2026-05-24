import { IndodaxClient, IndodaxTradeResponse } from './indodax-api';
import { logger } from '@/shared/logger';

export interface TradeParams {
  pair: string;
  type: 'buy' | 'sell';
  price: number;
  amount: number;
  amountType: 'coin' | 'fiat';
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
      { pair: params.pair, type: params.type, price: params.price, amount: params.amount, amountType: params.amountType },
      'TradeExecutor.executeTrade',
    );

    const apiParams: Record<string, string | number> = {
      pair: params.pair,
      type: params.type,
      price: params.price,
    };

    if (params.type === 'buy') {
      if (params.amountType === 'fiat') {
        apiParams['idr'] = params.amount;
      } else {
        apiParams[params.pair.replace('_idr', '').replace('idr', '')] = params.amount;
      }
    } else {
      if (params.amountType === 'coin') {
        const coinKey = params.pair.replace('_idr', '');
        apiParams[coinKey] = params.amount;
      } else {
        apiParams['idr'] = params.amount;
      }
    }

    try {
      const response = await this.client.privateRequest<IndodaxTradeResponse>('trade', apiParams);

      logger.info(
        { orderId: response.return.order_id, receive: response.return.receive },
        'Trade executed successfully',
      );

      return {
        success: true,
        orderId: response.return.order_id,
        receive: response.return.receive,
        remainder: response.return.remainder,
        balance: response.return.balance,
      };
    } catch (err) {
      const message = (err as Error).message;
      logger.error({ error: message, params }, 'Trade execution failed');
      return { success: false, error: message };
    }
  }
}
