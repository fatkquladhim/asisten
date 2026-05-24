import { AgentBase } from '@/agents/base';
import { logDailyMetrics, checkStockLevels } from './tools/inventory-manager';
import { ingestSensorData } from './tools/telemetry-ingest';
import { getRegionalClimateData } from './tools/climate-ops';
import type { ExecutionStep } from '@/shared/types';
import { logger } from '@/shared/logger';

export class ErpAgent extends AgentBase {
  override async execute(
    step: ExecutionStep,
    _context: Record<string, unknown>,
  ): Promise<unknown> {
    logger.debug({ action: step.action, params: step.params }, 'ErpAgent.execute');

    switch (step.action) {
      case 'log_metrics':
      case 'log_daily_metrics': {
        return logDailyMetrics({
          resourceId: step.params['resourceId'] as string,
          mortality: step.params['mortality'] as number,
          feedConsumedKg: step.params['feedConsumedKg'] as number,
        });
      }

      case 'check_stock':
      case 'check_stock_levels': {
        return checkStockLevels();
      }

      case 'ingest_telemetry':
      case 'ingest_sensor_data': {
        return ingestSensorData({
          resourceId: step.params['resourceId'] as string,
          deviceId: step.params['deviceId'] as string,
          payload: step.params['payload'] as {
            temp: number;
            humidity: number;
            ammonia?: number;
          },
        });
      }

      case 'analyze_conditions':
      case 'get_climate': {
        const region = (step.params['region'] as string) ?? 'Turen, Malang';
        return getRegionalClimateData(region);
      }

      default:
        throw new Error(`ErpAgent: unknown action "${step.action}"`);
    }
  }
}
