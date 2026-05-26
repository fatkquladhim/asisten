import { MarketIntelligence } from './market-intelligence';

export class EmergencyShield {
  constructor(private marketIntel: MarketIntelligence) {}

  async checkGlobalEmergency(): Promise<{ isEmergency: boolean; reason?: string }> {
    try {
      const bars = await this.marketIntel.fetchCandles('btc_idr', '60');
      if (bars.length < 2) return { isEmergency: false };

      const last = bars[bars.length - 1]!;
      const prev = bars[bars.length - 2]!;
      const dropPct = (prev.close - last.close) / prev.close;

      if (dropPct >= 0.02) {
        return {
          isEmergency: true,
          reason: `BTC FLASH DUMP: ${(dropPct * 100).toFixed(2)}% in 1H`,
        };
      }

      return { isEmergency: false };
    } catch {
      return { isEmergency: false };
    }
  }
}