import { AgentBase } from '@/agents/base';
import { IndodaxClient } from './tools/indodax-api';
import { CryptoFeed } from './tools/crypto-feed';
import { TradeExecutor, TradeParams } from './tools/trade-executor';
import { MarketIntelligence } from './tools/market-intelligence';
import { SMCEngine } from './tools/smc-engine';
import { PredatorStrategy, PredatorInput } from './tools/predator-strategy';
import { AlphaHunter } from './tools/alpha-hunter';
import { NarrativeEngine } from './tools/narrative-engine';
import { WhaleDetector } from './tools/whale-detector';
import { MemeRadar } from './tools/meme-radar';
import { SniperEntry } from './tools/sniper-entry';
import { EmergencyShield } from './tools/emergency-shield';
import { MacroRegimeEngine } from './tools/macro-regime';
import { ExitManager } from './tools/exit-manager';
import { RiskManager, RiskConfig } from './tools/risk-manager';
import { AIConsensus } from './tools/ai-consensus';
import { AISentinel } from './tools/ai-sentinel';
import { TradeRepository } from './trade-repository';
import { PaperExecutor } from './paper-executor';
import { CompoundingEngine, type CompoundingConfig } from './compounding-engine';
import { PerformanceTracker } from './performance-tracker';
import type { ExecutionStep } from '@/shared/types';
import { logger } from '@/shared/logger';

export class QuantAgent extends AgentBase {
  private feed: CryptoFeed;
  private executor: TradeExecutor;
  private marketIntel: MarketIntelligence;
  private smcEngine: SMCEngine;
  private scanner: AlphaHunter;
  private narrativeEngine: NarrativeEngine;
  private whaleDetector: WhaleDetector;
  private memeRadar: MemeRadar;
  private sniperEntry: SniperEntry;
  private emergencyShield: EmergencyShield;
  private macroRegime: MacroRegimeEngine;
  private riskManager: RiskManager;
  private aiSentinel: AISentinel;
  private repo: TradeRepository;
  private paperExecutor: PaperExecutor;
  private perfTracker: PerformanceTracker;

  constructor(private client: IndodaxClient, riskConfig?: RiskConfig) {
    super();
    this.feed = new CryptoFeed(client);
    this.executor = new TradeExecutor(client);
    this.marketIntel = new MarketIntelligence(client);
    this.smcEngine = new SMCEngine(this.marketIntel);
    this.scanner = new AlphaHunter(client, this.marketIntel);
    this.narrativeEngine = new NarrativeEngine(this.marketIntel);
    this.whaleDetector = new WhaleDetector(this.marketIntel);
    this.memeRadar = new MemeRadar(this.marketIntel);
    this.sniperEntry = new SniperEntry(this.marketIntel);
    this.emergencyShield = new EmergencyShield(this.marketIntel);
    this.macroRegime = new MacroRegimeEngine(this.marketIntel);
    this.riskManager = new RiskManager(riskConfig ?? {
      maxPositionSizePercent: 10,
      maxDrawdownDailyPercent: 5,
    });
    this.aiSentinel = new AISentinel(client, this.marketIntel);
    this.repo = new TradeRepository();
    this.paperExecutor = new PaperExecutor(this.repo, client);
    this.perfTracker = new PerformanceTracker(this.repo);
  }

  override async execute(
    step: ExecutionStep,
    _context: Record<string, unknown>,
  ): Promise<unknown> {
    logger.debug({ action: step.action, params: step.params }, 'QuantAgent.execute');

    switch (step.action) {
      // ── Market Data ────────────────────────────────────

      case 'get_price':
      case 'get_ticker': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.feed.getTicker(pair);
      }

      case 'get_ohlcv':
      case 'get_historical_data': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        const tf = (step.params['timeframe'] as string) ?? '60';
        const from = (step.params['from'] as number) ?? Math.floor(Date.now() / 1000) - 86400;
        const to = (step.params['to'] as number) ?? Math.floor(Date.now() / 1000);
        return this.feed.getHistoricalData(pair, tf, from, to);
      }

      // ── Order Book ─────────────────────────────────────

      case 'get_depth': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.client.getDepth(pair);
      }

      case 'get_all_pairs': {
        return this.client.getAllPairs();
      }

      case 'get_all_tickers': {
        return this.client.getAllTickers();
      }

      // ── Account ────────────────────────────────────────

      case 'get_info': {
        return this.client.getInfo();
      }

      case 'open_orders': {
        const pair = step.params['pair'] as string | undefined;
        return this.client.openOrders(pair);
      }

      case 'cancel_order': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        const orderId = (step.params['orderId'] as string) ?? '';
        const type = (step.params['type'] as 'buy' | 'sell') ?? 'buy';
        return this.client.cancelOrder(pair, orderId, type);
      }

      // ── Trading ────────────────────────────────────────

      case 'execute_trade': {
        const tradeParams: TradeParams = {
          pair: (step.params['pair'] as string) ?? 'btcidr',
          type: (step.params['type'] as 'buy' | 'sell') ?? 'buy',
          price: step.params['price'] as number,
          amount: step.params['amount'] as number,
        };
        return this.executor.executeTrade(tradeParams);
      }

      // ── Multi-TF Trend Analysis ────────────────────────

      case 'analyze_trend': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.marketIntel.analyzeTrend(pair);
      }

      // ── SMC Analysis ───────────────────────────────────

      case 'analyze_smc': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.smcEngine.analyze(pair);
      }

      // ── Orderbook Analysis ─────────────────────────────

      case 'analyze_orderbook': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.marketIntel.analyzeOrderbook(pair);
      }

      // ── ATR Targets ────────────────────────────────────

      case 'calculate_targets': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        const entryPrice = step.params['entryPrice'] as number;
        if (!entryPrice || entryPrice <= 0) {
          throw new Error('calculate_targets requires a valid entryPrice');
        }
        return this.marketIntel.calculateATRTargets(pair, entryPrice);
      }

      // ── Narrative Analysis ──────────────────────────────

      case 'get_narrative_insight': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.narrativeEngine.getNarrativeScore(pair);
      }

      case 'get_narrative_report': {
        return this.narrativeEngine.generateReport();
      }

      // ── Whale Detection ─────────────────────────────────

      case 'detect_whale': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.whaleDetector.detect(pair);
      }

      // ── Meme Radar ──────────────────────────────────────

      case 'analyze_meme_rotation': {
        return this.memeRadar.analyzeMemeRotation();
      }

      // ── Sniper Entry ────────────────────────────────────

      case 'scan_sniper_entry': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.sniperEntry.scan(pair);
      }

      // ── Emergency Shield ───────────────────────────────

      case 'check_emergency': {
        return this.emergencyShield.checkGlobalEmergency();
      }

      // ── Macro Regime ────────────────────────────────────

      case 'get_macro_regime': {
        return this.macroRegime.getCurrentRegime();
      }

      // ── Risk Manager ────────────────────────────────────

      case 'check_kill_switch': {
        const btcDrop = (step.params['btcDropPercent'] as number) ?? 0;
        const apiErrors = (step.params['consecutiveApiErrors'] as number) ?? 0;
        return this.riskManager.isKillSwitchEngaged(0, btcDrop, apiErrors);
      }

      case 'validate_execution': {
        const ask = step.params['askPrice'] as number;
        const bid = step.params['bidPrice'] as number;
        return { valid: this.riskManager.validateExecution(ask, bid) };
      }

      case 'validate_correlation': {
        const pair = (step.params['pair'] as string) ?? '';
        const openPairs = (step.params['openPairs'] as string[]) ?? [];
        return { valid: this.riskManager.validateCorrelation(pair, openPairs) };
      }

      case 'calculate_position_size': {
        const balance = step.params['totalBalance'] as number;
        const entry = step.params['entryPrice'] as number;
        const sl = step.params['stopLoss'] as number;
        const riskPct = (step.params['riskPercent'] as number) ?? 1;
        return { positionSize: this.riskManager.calculatePositionSize(balance, entry, sl, riskPct) };
      }

      case 'record_trade_result': {
        const type = step.params['type'] as 'win' | 'loss';
        const amount = (step.params['amount'] as number) ?? 0;
        if (type === 'loss') this.riskManager.recordLoss(amount);
        else this.riskManager.recordWin();
        return { recorded: true };
      }

      // ── Exit Manager ────────────────────────────────────

      case 'calculate_exit_plan': {
        const entryPrice = step.params['entryPrice'] as number;
        if (!entryPrice || entryPrice <= 0) throw new Error('entryPrice required');
        return ExitManager.calculateInitialPlan(entryPrice);
      }

      case 'monitor_position': {
        const current = step.params['currentPrice'] as number;
        const entry = step.params['entryPrice'] as number;
        const sl = step.params['currentSL'] as number;
        const tpsHit = (step.params['tpsHit'] as number[]) ?? [];
        const ts = step.params['entryTimestamp'] as number | undefined;
        return ExitManager.monitor(current, entry, sl, tpsHit, ts);
      }

      // ── Predator Score ─────────────────────────────────

      case 'score_opportunity': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        const entryPrice = step.params['entryPrice'] as number;

        const [emergency, smcResult, targets, narrativeScore, whale, sniper, memeRotation] = await Promise.all([
          this.emergencyShield.checkGlobalEmergency(),
          this.smcEngine.analyze(pair),
          entryPrice && entryPrice > 0
            ? this.marketIntel.calculateATRTargets(pair, entryPrice)
            : Promise.resolve(undefined),
          this.narrativeEngine.getNarrativeScore(pair),
          this.whaleDetector.detect(pair),
          this.sniperEntry.scan(pair),
          MemeRadar.isMeme(pair) ? this.memeRadar.analyzeMemeRotation() : Promise.resolve(undefined),
        ]);

        if (emergency.isEmergency) {
          return {
            shouldBuy: false,
            action: 'SKIP',
            reason: emergency.reason,
            score: 0,
          };
        }

        const memeBoost = memeRotation ? (memeRotation.boosts[pair] || 0) : 0;

        const input: PredatorInput = {
          aiConsensusScore: (step.params['aiConsensusScore'] as number) ?? 0,
          smcScore: smcResult.smcScore,
          narrativeScore,
          sniperConfidence: sniper.confidence,
          whaleActive: whale.isWhaleActive,
          memeBoost,
          alphaHunterScore: (step.params['alphaHunterScore'] as number) ?? 0,
          entryPrice,
          atrTargets: targets ?? { sl: 0, tp1: 0, tp2: 0 },
        };

        const regime = (step.params['regime'] as string) ?? 'NEUTRAL';
        return PredatorStrategy.evaluate(
          input,
          regime as 'PREDATOR' | 'WAR' | 'DEFENSE' | 'NEUTRAL',
        );
      }

      // ── Market Scanner (AlphaHunter) ────────────────────

      case 'scan_market': {
        const topN = (step.params['topN'] as number) ?? 10;
        return this.scanner.hunt(topN);
      }

      // ── AI Sentinel ──────────────────────────────────────

      case 'analyze_with_ai': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        return this.aiSentinel.analyzePair(pair);
      }

      case 'analyze_with_ai_consensus': {
        const pair = (step.params['pair'] as string) ?? 'btcidr';
        const modelCount = (step.params['modelCount'] as number) ?? 2;
        const results = await this.aiSentinel.analyzePairWithConsensus(pair, modelCount);
        return {
          results,
          consensus: AIConsensus.calculate(results),
        };
      }

      // ── Persistent Trading ──────────────────────────────

      case 'paper_open': {
        return this.paperExecutor.openTrade({
          pair: (step.params['pair'] as string) ?? '',
          side: (step.params['side'] as 'buy' | 'sell') ?? 'buy',
          quantity: (step.params['quantity'] as string) ?? '0',
          entryPrice: (step.params['entryPrice'] as string) ?? '0',
          stopLoss: step.params['stopLoss'] as string | undefined,
          takeProfit1: step.params['takeProfit1'] as string | undefined,
          takeProfit2: step.params['takeProfit2'] as string | undefined,
          takeProfit3: step.params['takeProfit3'] as string | undefined,
          strategyId: step.params['strategyId'] as string | undefined,
        });
      }

      case 'paper_close': {
        const posId = (step.params['positionId'] as string) ?? '';
        const price = (step.params['currentPrice'] as string) ?? '0';
        return this.paperExecutor.closePosition(posId, price);
      }

      case 'paper_monitor': {
        const acctId = (step.params['accountId'] as string) ?? '';
        await this.paperExecutor.monitorPositions(acctId);
        return { monitored: true };
      }

      case 'get_open_positions': {
        const aid = (step.params['accountId'] as string) ?? (await this.repo.getDefaultAccount()) ?? '';
        return this.repo.getOpenPositions(aid);
      }

      case 'get_performance': {
        const perfAccountId = (step.params['accountId'] as string) ?? (await this.repo.getDefaultAccount()) ?? '';
        return this.perfTracker.getReport(perfAccountId);
      }

      // ── Compounding Engine ──────────────────────────────

      case 'calculate_position_sizing': {
        const cfg: CompoundingConfig = {
          initialBalance: (step.params['initialBalance'] as number) ?? 0,
          currentBalance: (step.params['currentBalance'] as number) ?? 0,
          winRate: (step.params['winRate'] as number) ?? 0.5,
          avgWinPercent: (step.params['avgWinPercent'] as number) ?? 5,
          avgLossPercent: (step.params['avgLossPercent'] as number) ?? 3,
          reinvestRatio: (step.params['reinvestRatio'] as number) ?? 0.5,
        };
        return CompoundingEngine.calculatePositionSize(cfg);
      }

      case 'calculate_reinvest': {
        const curBal = (step.params['currentBalance'] as number) ?? 0;
        const initBal = (step.params['initialBalance'] as number) ?? 0;
        const alloc = (step.params['targetAllocation'] as number) ?? 0.5;
        return CompoundingEngine.calculateReinvest(curBal, initBal, alloc);
      }

      default:
        throw new Error(`QuantAgent: unknown action "${step.action}"`);
    }
  }
}
