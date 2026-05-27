import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PORT: z.coerce.number().default(3000),
  OPENAI_API_KEY: z.string().optional(),
  BINANCE_API_KEY: z.string().optional(),
  BINANCE_SECRET_KEY: z.string().optional(),
  BYBIT_API_KEY: z.string().optional(),
  BYBIT_SECRET_KEY: z.string().optional(),
  INDODAX_API_KEY: z.string().optional(),
  INDODAX_SECRET_KEY: z.string().optional(),
  BURSA_API_KEY: z.string().optional(),
  SUMOPOD_API_KEY: z.string().optional(),
  SUMOPOD_BASE_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
