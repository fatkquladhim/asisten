import { TradeRepository, CreatePositionInput } from './trade-repository';
import { ExitManager } from './tools/exit-manager';
import { IndodaxClient } from './tools/indodax-api';
import { logger } from '@/shared/logger';

export interface PaperTradeRequest {
  pair: string;
  side: 'buy' | 'sell';
  quantity: string;
  entryPrice: string;
  stopLoss?: string;
  takeProfit1?: string;
  takeProfit2?: string;
  takeProfit3?: string;
  strategyId?: string;
}

export interface PaperTradeResult {
  success: boolean;
  positionId?: string;
  error?: string;
}

export class PaperExecutor {
  constructor(private repo: TradeRepository, private indodax?: IndodaxClient) {}

  async openTrade(req: PaperTradeRequest): Promise<PaperTradeResult> {
    try {
      const accountId = await this.repo.getDefaultAccount();
      if (!accountId) {
        return { success: false, error: 'No account found in database' };
      }
      const existing = await this.repo.getOpenPosition(req.pair, accountId);
      if (existing) {
        return { success: false, error: `Already have open position for ${req.pair}` };
      }
      const input: CreatePositionInput = {
        accountId,
        pair: req.pair,
        side: req.side,
        quantity: req.quantity,
        entryPrice: req.entryPrice,
        stopLoss: req.stopLoss,
        takeProfit1: req.takeProfit1,
        takeProfit2: req.takeProfit2,
        takeProfit3: req.takeProfit3,
        strategyId: req.strategyId,
        isPaper: true,
      };
      const pos = await this.repo.createPosition(input);
      logger.info({ pair: req.pair, entry: req.entryPrice, id: pos.id }, 'Paper trade opened');
      return { success: true, positionId: pos.id };
    } catch (err) {
      const msg = (err as Error).message;
      logger.error({ error: msg, req }, 'PaperExecutor.openTrade failed');
      return { success: false, error: msg };
    }
  }

  async monitorPositions(accountId: string): Promise<void> {
    const open = await this.repo.getOpenPositions(accountId);
    for (const pos of open) {
      try {
        let currentPrice = Number(pos.entryPrice);
        if (this.indodax) {
          try {
            const ticker = await this.indodax.publicRequest<{ ticker: { last: string } }>(`/api/ticker/${pos.pair}`);
            if (ticker?.ticker?.last) currentPrice = Number(ticker.ticker.last);
          } catch { }
        }
        const update = ExitManager.monitor(
          currentPrice,
          Number(pos.entryPrice),
          Number(pos.currentStopLoss ?? 0),
          pos.tpsHit,
          pos.openedAt.getTime(),
        );
        if (update.shouldClose) {
          await this.repo.closePosition(pos.id, String(currentPrice), update.closeReason as any);
          logger.info({ pair: pos.pair, reason: update.closeReason }, 'Paper position closed by ExitManager');
        } else if (update.tpHit !== undefined) {
          const newTpsHit = [...pos.tpsHit, update.tpHit];
          await this.repo.updatePosition(pos.id, { tpsHit: newTpsHit });
        } else if (update.newSL !== undefined && update.newSL !== Number(pos.currentStopLoss)) {
          await this.repo.updatePosition(pos.id, { currentStopLoss: String(update.newSL) });
        }
      } catch (err) {
        logger.error({ pair: pos.pair, error: (err as Error).message }, 'monitorPositions error');
      }
    }
  }

  async closePosition(positionId: string, currentPrice: string): Promise<PaperTradeResult> {
    try {
      await this.repo.closePosition(positionId, currentPrice, 'CLOSED_MANUAL');
      return { success: true, positionId };
    } catch (err) {
      const msg = (err as Error).message;
      return { success: false, error: msg };
    }
  }
}
