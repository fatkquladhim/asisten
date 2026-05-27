import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { logger } from '@/shared/logger';

const MARKET_WS_URL = 'wss://ws3.indodax.com/ws/';
const STATIC_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE5NDY2MTg0MTV9.UR1lBM6Eqh0yWz-PVirw1uPCxe60FdchR8eNVdsskeo';

export type MarketChannel =
  | `chart:tick-${string}`
  | 'market:summary-24h'
  | `market:trade-activity-${string}`
  | `market:order-book-${string}`;

export interface WSMessage {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
  push?: {
    channel: string;
    pub: { data: unknown[] };
  };
}

export interface TickData {
  timestamp: number;
  sequence: number;
  price: number;
  volume: string;
}

export interface TradeActivity {
  pair: string;
  timestamp: number;
  sequence: number;
  side: 'buy' | 'sell';
  price: number;
  idrVolume: string;
  assetVolume: string;
}

export interface OrderBookLevel {
  price: number;
  assetVolume: string;
  idrVolume: string;
}

export interface OrderBookSnapshot {
  pair: string;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  offset: number;
}

/**
 * Indodax Market Data WebSocket Client (2026 protocol)
 * 
 * Production-grade: auto-reconnect, offset recovery, typed events.
 * Used for real-time feeds in scheduler / alpha hunter (reduces REST polling).
 * 
 * Auth: static JWT after connect.
 * Subscribe: method=1, channel=...
 * Recover: on reconnect, use last known offset + recover:true.
 * 
 * Events:
 *   - 'open'
 *   - 'close'
 *   - 'error'
 *   - 'tick:<pair>' → TickData
 *   - 'trade:<pair>' → TradeActivity
 *   - 'orderbook:<pair>' → OrderBookSnapshot
 *   - 'summary-24h' → raw summary rows
 */
export class IndodaxMarketWS extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnect = 10;
  private readonly baseBackoff = 1000;
  private subscribed = new Map<string, number>(); // channel -> lastOffset
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(private url: string = MARKET_WS_URL) {
    super();
  }

  async connect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      logger.info('Indodax Market WS connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.authenticate();
      this.startPing();
      this.emit('open');
      // Re-subscribe previous channels with recovery if offset known
      for (const [channel, offset] of this.subscribed) {
        this.subscribe(channel as MarketChannel, offset > 0 ? offset : undefined, true);
      }
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Market WS parse error');
      }
    });

    this.ws.on('close', (code, reason) => {
      logger.warn({ code, reason: reason.toString() }, 'Indodax Market WS closed');
      this.connected = false;
      this.stopPing();
      this.emit('close');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.error({ error: err.message }, 'Indodax Market WS error');
      this.emit('error', err);
      this.ws?.close();
    });
  }

  private authenticate(): void {
    if (!this.ws) return;
    const authMsg = {
      params: { token: STATIC_TOKEN },
      id: Date.now(),
    };
    this.ws.send(JSON.stringify(authMsg));
    logger.debug('Market WS auth sent');
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.connected) {
        // Method 7 = ping per docs
        this.ws.send(JSON.stringify({ method: 7, id: Date.now() }));
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  subscribe(channel: MarketChannel, lastOffset?: number, recover = false): void {
    if (!this.ws || !this.connected) {
      // Queue for after connect
      this.subscribed.set(channel, lastOffset ?? 0);
      return;
    }

    const params: any = { channel };
    if (recover && lastOffset) {
      params.recover = true;
      params.offset = lastOffset;
    }

    const msg = {
      method: 1,
      params,
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(msg));
    this.subscribed.set(channel, lastOffset ?? 0);
    logger.debug({ channel, recover, offset: lastOffset }, 'Market WS subscribe');
  }

  unsubscribe(channel: MarketChannel): void {
    if (!this.ws || !this.connected) return;

    const msg = {
      method: 2,
      params: { channel },
      id: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
    this.subscribed.delete(channel);
    logger.debug({ channel }, 'Market WS unsubscribe');
  }

  private handleMessage(msg: WSMessage): void {
    if (msg.error) {
      logger.error({ error: msg.error }, 'Market WS error response');
      this.emit('error', new Error(msg.error.message));
      return;
    }

    // Handle push (live data)
    if (msg.push?.channel) {
      const channel = msg.push.channel;
      const data = msg.push.pub?.data ?? [];

      if (channel === 'market:summary-24h') {
        this.emit('summary-24h', data);
        return;
      }

      if (channel.startsWith('chart:tick-')) {
        const pair = channel.replace('chart:tick-', '');
        const ticks: TickData[] = (data as any[][]).map((d: any[]) => ({
          timestamp: d[0],
          sequence: d[1],
          price: d[2],
          volume: d[3],
        }));
        ticks.forEach((t) => this.emit(`tick:${pair}`, t));
        return;
      }

      if (channel.startsWith('market:trade-activity-')) {
        const pair = channel.replace('market:trade-activity-', '');
        const trades: TradeActivity[] = (data as any[][]).map((d: any[]) => ({
          pair: d[0],
          timestamp: d[1],
          sequence: d[2],
          side: d[3],
          price: d[4],
          idrVolume: d[5],
          assetVolume: d[6],
        }));
        trades.forEach((t) => this.emit(`trade:${pair}`, t));
        return;
      }

      if (channel.startsWith('market:order-book-')) {
        const pair = channel.replace('market:order-book-', '');
        const obData = (data[0] as any)?.data ?? (data[0] as any);
        if (obData) {
          const snapshot: OrderBookSnapshot = {
            pair: obData.pair,
            asks: (obData.ask ?? []).map((a: any) => ({
              price: Number(a.price),
              assetVolume: a.btc_volume ?? a.asset_volume ?? '0',
              idrVolume: a.idr_volume ?? '0',
            })),
            bids: (obData.bid ?? []).map((b: any) => ({
              price: Number(b.price),
              assetVolume: b.btc_volume ?? b.asset_volume ?? '0',
              idrVolume: b.idr_volume ?? '0',
            })),
            offset: obData.offset ?? 0,
          };
          this.subscribed.set(channel, snapshot.offset);
          this.emit(`orderbook:${pair}`, snapshot);
        }
        return;
      }
    }

    // Handle subscribe ack with offset
    if (msg.result && typeof msg.result === 'object' && 'offset' in (msg.result as any)) {
      const result = msg.result as any;
      if (result.recoverable && result.offset) {
        // Update offset for the last subscribed channel (heuristic)
        const lastChannel = [...this.subscribed.keys()].pop();
        if (lastChannel) this.subscribed.set(lastChannel, result.offset);
      }
    }

    this.emit('message', msg);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnect) {
      logger.error('Market WS max reconnect attempts reached');
      return;
    }
    const delay = this.baseBackoff * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    logger.info({ delay, attempt: this.reconnectAttempts }, 'Market WS scheduling reconnect');
    setTimeout(() => this.connect().catch(() => {}), delay);
  }

  close(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.subscribed.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Placeholder for Private WS (to be fully implemented in Phase 2 with generate_token support in IndodaxClient)
export class IndodaxPrivateWS extends EventEmitter {
  // TODO: implement using generate_token REST + wss://pws.indodax.com/ws/?cf_ws_frame_ping_pong=true
  // Will emit 'order_update' events with full fee/tax/clearing details for accurate reconciliation.
  constructor() {
    super();
    logger.warn('IndodaxPrivateWS not yet implemented (Phase 2)');
  }
  // connect(token: string, channel: string) ...
}
