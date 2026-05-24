import { createHmac } from 'node:crypto';
import { env } from '@/config/index';
import { logger } from '@/shared/logger';

const BASE_URL = 'https://indodax.com';
const TAPI_URL = 'https://indodax.com/tapi';

export interface IndodaxTicker {
  ticker: {
    high: string;
    low: string;
    buy: string;
    sell: string;
    last: string;
    vol: string;
    server_time: string;
  };
}

export interface IndodaxTradeHistory {
  trade: {
    date: string;
    price: string;
    amount: string;
    type: 'buy' | 'sell';
  }[];
}

export interface IndodaxDepth {
  buy: [string, string][];
  sell: [string, string][];
}

export interface IndodaxTradingViewHistory {
  s: 'ok' | 'no_data';
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export interface IndodaxTradeResponse {
  success: number;
  return: {
    receive: string;
    order_id: string;
    remainder: string;
    balance: Record<string, string>;
  };
}

export interface IndodaxErrorResponse {
  success: 0;
  error: string;
}

export class IndodaxClient {
  private apiKey: string;
  private secretKey: string;
  private lastRequestTime = 0;
  private readonly minInterval = 1000;

  constructor() {
    this.apiKey = env.INDODAX_API_KEY ?? '';
    this.secretKey = env.INDODAX_SECRET_KEY ?? '';
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0 && this.secretKey.length > 0;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async publicRequest<T>(endpoint: string): Promise<T> {
    await this.rateLimit();

    const url = `${BASE_URL}${endpoint}`;
    logger.debug({ url }, 'Indodax public request');

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, body: text }, 'Indodax public request failed');
      throw new Error(`Indodax public API error: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async privateRequest<T>(
    method: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new Error('Indodax API credentials not configured');
    }

    await this.rateLimit();

    const nonce = Date.now().toString();
    const bodyParams = new URLSearchParams();
    bodyParams.set('method', method);
    bodyParams.set('nonce', nonce);

    for (const [key, value] of Object.entries(params)) {
      bodyParams.set(key, String(value));
    }

    const payload = bodyParams.toString();
    const sign = createHmac('sha512', this.secretKey).update(payload).digest('hex');

    logger.debug({ method, nonce }, 'Indodax private request');

    const response = await fetch(TAPI_URL, {
      method: 'POST',
      headers: {
        Key: this.apiKey,
        Sign: sign,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, body: text }, 'Indodax private request failed');
      throw new Error(`Indodax private API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as T | IndodaxErrorResponse;

    const errorResp = data as IndodaxErrorResponse;
    if (errorResp.success === 0) {
      logger.error({ error: errorResp.error }, 'Indodax API returned error');
      throw new Error(`Indodax API error: ${errorResp.error}`);
    }

    return data as T;
  }
}
