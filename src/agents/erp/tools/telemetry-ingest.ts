import { eq } from 'drizzle-orm';
import { getDb } from '@/config/database';
import { iotTelemetry, resources } from '@/db/schema/erp';
import { logger } from '@/shared/logger';

export interface SensorPayload {
  temp: number;
  humidity: number;
  ammonia?: number;
}

export interface TelemetryInput {
  resourceId: string;
  deviceId: string;
  payload: SensorPayload;
}

export async function ingestSensorData(
  input: TelemetryInput,
): Promise<{ ok: boolean; rowId?: string }> {
  const db = getDb();
  const { resourceId, deviceId, payload } = input;

  logger.info(
    { resourceId, deviceId, temp: payload.temp, humidity: payload.humidity },
    'Ingesting IoT telemetry',
  );

  try {
    const result = await db
      .insert(iotTelemetry)
      .values({
        resourceId,
        deviceId,
        payload: payload as unknown as Record<string, unknown>,
      })
      .returning({ time: iotTelemetry.time });

    await db
      .update(resources)
      .set({
        telemetry: {
          temperature: payload.temp,
          humidity: payload.humidity,
        },
        lastSeen: new Date(),
      })
      .where(eq(resources.id, resourceId));

    logger.info(
      { time: result[0]?.time },
      'Telemetry ingested and resource updated',
    );

    return { ok: true };
  } catch (err) {
    logger.error(
      { error: (err as Error).message, resourceId, deviceId },
      'Failed to ingest telemetry',
    );
    throw err;
  }
}
