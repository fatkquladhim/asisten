import { logger } from '@/shared/logger';

export interface RegionalClimate {
  region: string;
  date: string;
  temperature: {
    min: number;
    max: number;
    current: number;
  };
  humidity: {
    min: number;
    max: number;
    current: number;
  };
  rainfall: {
    probability: number;
    monthlyMm: number;
  };
  season: string;
  advisory: string;
}

export async function getRegionalClimateData(
  region = 'Turen, Malang',
): Promise<RegionalClimate> {
  logger.debug({ region }, 'Fetching regional climate data');

  const now = new Date();
  const month = now.getMonth();
  const hour = now.getHours();

  const isRainySeason = month >= 10 || month <= 2;

  const baseTemp = isRainySeason ? 24 : 27;
  const baseHumidity = isRainySeason ? 78 : 65;
  const rainfallProb = isRainySeason ? 0.75 : 0.15;

  const diurnalVariation = Math.sin(((hour - 6) / 12) * Math.PI) * 4;
  const currentTemp = baseTemp + Math.max(0, diurnalVariation);
  const currentHumidity = baseHumidity - (currentTemp - baseTemp) * 2;

  const advisory = isRainySeason
    ? 'Rainy season active. Monitor ammonia levels closely. Ensure shelter ventilation and reduce feed dust exposure.'
    : 'Dry season. Increase water supply monitoring. Watch for heat stress in midday hours.';

  const climate: RegionalClimate = {
    region,
    date: now.toISOString().split('T')[0]!,
    temperature: {
      min: Math.round((baseTemp - 2) * 10) / 10,
      max: Math.round((baseTemp + 6) * 10) / 10,
      current: Math.round(currentTemp * 10) / 10,
    },
    humidity: {
      min: Math.round(Math.max(40, currentHumidity - 15)),
      max: Math.round(Math.min(95, currentHumidity + 10)),
      current: Math.round(currentHumidity * 10) / 10,
    },
    rainfall: {
      probability: rainfallProb,
      monthlyMm: isRainySeason ? 250 : 35,
    },
    season: isRainySeason ? 'rainy' : 'dry',
    advisory,
  };

  logger.debug({ climate }, 'Regional climate data retrieved');
  return climate;
}
