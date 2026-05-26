import { createHmac } from 'node:crypto';
import { env } from '@/config/index';
import { logger } from '@/shared/logger';

const BASE_URL = 'https://indodax.com';
const TAPI_URL = 'https://indodax.com/tapi';

// ── Public API Types ────────────────────────────────────────

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

export interface IndodaxPairInfo {
  id: string;
  symbol: string;
  base_currency: string;
  traded_currency: string;
  description: string;
}

export interface IndodaxAllTickers {
  tickers: Record<string, {
    high: string;
    low: string;
    vol_asset: string;
    vol_idr: string;
    last: string;
    buy: string;
    sell: string;
    server_time: number;
  }>;
}

// ── Private API Types ───────────────────────────────────────

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

export interface IndodaxGetInfoResponse {
  success: 1;
  return: {
    balance: Record<string, string>;
    balance_hold: Record<string, string>;
    address: Record<string, string>;
  };
}

export interface IndodaxOpenOrder {
  order_id: string;
  submit_time: string;
  price: string;
  type: 'buy' | 'sell';
  order_type: 'limit' | 'market';
  remainder_idr: string;
  remainder_coin: string;
  amount_coin: string;
  amount_coin_original: string;
  status: string;
}

export interface IndodaxOpenOrdersResponse {
  success: 1;
  return: {
    orders: IndodaxOpenOrder[];
  };
}

export interface IndodaxCancelOrderResponse {
  success: 1;
  return: {
    order_id: string;
    type: 'buy' | 'sell';
    amount_coin: string;
    remainder_coin: string;
    fee: string;
  };
}

// ── In-Memory Cache ─────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiry: number;
}

// ── Client ──────────────────────────────────────────────────

export class IndodaxClient {
  private apiKey: string;
  private secretKey: string;
  private lastRequestTime = 0;
  private readonly minInterval = 1000;
  private cache = new Map<string, CacheEntry>();

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

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiry) return entry.data as T;
    this.cache.delete(key);
    return null;
  }

  private setCached(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  // ── Public API ──────────────────────────────────────────

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

  /** GET /api/depth/:pair — cache 30s */
  async getDepth(pair: string): Promise<IndodaxDepth> {
    const key = `depth_${pair}`;
    const cached = this.getCached<IndodaxDepth>(key);
    if (cached) return cached;
    const data = await this.publicRequest<IndodaxDepth>(`/api/depth/${pair}`);
    this.setCached(key, data, 30_000);
    return data;
  }

  /** GET /api/pairs — cache 1h */
  async getAllPairs(): Promise<IndodaxPairInfo[]> {
    const key = 'all_pairs';
    const cached = this.getCached<IndodaxPairInfo[]>(key);
    if (cached) return cached;
    const raw = await this.publicRequest<unknown[]>('/api/pairs');
    const pairs = (raw as any[]).map((p) => ({
      id: p.id || '',
      symbol: (p.traded_currency || '').toLowerCase(),
      base_currency: (p.base_currency || '').toLowerCase(),
      traded_currency: (p.traded_currency || '').toLowerCase(),
      description: p.description || '',
    })).filter((p: IndodaxPairInfo) => p.base_currency === 'idr' && p.traded_currency !== 'idr');
    this.setCached(key, pairs, 3_600_000);
    return pairs;
  }

  /** GET ticker_all — cache 60s, single call for every pair ticker */
  async getAllTickers(): Promise<Record<string, any>> {
    const key = 'all_tickers';
    const cached = this.getCached<Record<string, any>>(key);
    if (cached) return cached;
    const data = await this.publicRequest<IndodaxAllTickers>('/api/ticker_all');
    const tickers = data.tickers || {};
    this.setCached(key, tickers, 60_000);
    return tickers;
  }

  /** GET /api/server_time */
  async getServerTime(): Promise<number> {
    const data = await this.publicRequest<{ server_time: number }>('/api/server_time');
    return data.server_time;
  }

  // ── Private API (TAPI) ──────────────────────────────────

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

  /** getInfo — account balances */
  async getInfo(): Promise<IndodaxGetInfoResponse['return']> {
    const resp = await this.privateRequest<IndodaxGetInfoResponse>('getInfo');
    return resp.return;
  }

  /** openOrders — list open orders, optionally filtered by pair */
  async openOrders(pair?: string): Promise<IndodaxOpenOrder[]> {
    const params: Record<string, string | number> = {};
    if (pair) params['pair'] = pair;
    const resp = await this.privateRequest<IndodaxOpenOrdersResponse>('openOrders', params);
    return resp.return.orders;
  }

  /** cancelOrder — cancel an existing order */
  async cancelOrder(pair: string, orderId: string, type: 'buy' | 'sell'): Promise<IndodaxCancelOrderResponse['return']> {
    const params = { pair, order_id: orderId, type };
    const resp = await this.privateRequest<IndodaxCancelOrderResponse>('cancelOrder', params);
    return resp.return;
  }

  /** trade — place a limit order (handles sub-rupiah prices) */
  async trade(
    pair: string,
    type: 'buy' | 'sell',
    price: number,
    amount: number,
  ): Promise<IndodaxTradeResponse['return']> {
    if (type === 'buy' && amount < 10000) {
      throw new Error(`Minimum buy amount is Rp 10,000 (requested: Rp ${amount})`);
    }

    const cleanPrice = price >= 1 ? Math.floor(price) : parseFloat(price.toFixed(8));

    if (cleanPrice <= 0) {
      throw new Error(`Invalid price: ${price} for pair ${pair}`);
    }

    const params: Record<string, string | number> = { pair, type, price: cleanPrice };

    const coin = pair.split('_')[0] ?? '';
    if (type === 'buy') {
      params['idr'] = Math.floor(amount);
    } else {
      params[coin] = parseFloat(amount.toFixed(8));
    }

    const resp = await this.privateRequest<IndodaxTradeResponse>('trade', params);
    return resp.return;
  }
}
