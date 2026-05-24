import { eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@/config/database';
import { resources, inventory } from '@/db/schema/erp';
import { logger } from '@/shared/logger';

export interface DailyMetricsInput {
  resourceId: string;
  mortality: number;
  feedConsumedKg: number;
}

export interface StockAlert {
  id: string;
  sku: string;
  name: string;
  quantity: string;
  unit: string;
  reorderPoint: string | null;
}

export async function logDailyMetrics(
  input: DailyMetricsInput,
): Promise<{ ok: boolean; feedUpdated: boolean }> {
  const db = getDb();
  const { resourceId, mortality, feedConsumedKg } = input;

  logger.info(
    { resourceId, mortality, feedConsumedKg },
    'Logging daily metrics',
  );

  try {
    const feedItem = await db
      .select()
      .from(inventory)
      .where(
        sql`${inventory.orgUnitId} = (SELECT org_unit_id FROM ${resources} WHERE ${resources.id} = ${resourceId}) AND ${inventory.sku} LIKE '%feed%'`,
      )
      .limit(1);

    if (feedItem.length > 0) {
      const currentQty = parseFloat(feedItem[0]!.quantity);
      const newQty = Math.max(0, currentQty - feedConsumedKg);

      await db
        .update(inventory)
        .set({
          quantity: newQty.toString(),
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, feedItem[0]!.id));

      logger.info(
        { sku: feedItem[0]!.sku, deducted: feedConsumedKg, remaining: newQty },
        'Feed inventory updated',
      );
    }

    await db
      .update(resources)
      .set({
        meta: sql`jsonb_set(COALESCE(meta, '{}'), '{dailyMortality}', ${mortality.toString()}::jsonb)`,
        lastSeen: new Date(),
      })
      .where(eq(resources.id, resourceId));

    return { ok: true, feedUpdated: feedItem.length > 0 };
  } catch (err) {
    logger.error({ error: (err as Error).message, resourceId }, 'Failed to log daily metrics');
    throw err;
  }
}

export async function checkStockLevels(): Promise<StockAlert[]> {
  const db = getDb();

  try {
    const results = await db
      .select()
      .from(inventory)
      .where(
        sql`${inventory.reorderPoint} IS NOT NULL AND CAST(${inventory.quantity} AS numeric) < ${inventory.reorderPoint}`,
      );

    logger.warn(
      { lowStockCount: results.length },
      'Stock level check completed',
    );

    return results.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      reorderPoint: r.reorderPoint,
    }));
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Failed to check stock levels');
    throw err;
  }
}
