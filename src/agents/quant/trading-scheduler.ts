import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '@/config/index';
import { logger } from '@/shared/logger';
import { QuantAgent } from './index';
import { IndodaxClient } from './tools/indodax-api';
import { TradeRepository } from './trade-repository';
import { PaperExecutor } from './paper-executor';
import { CompoundingEngine } from './compounding-engine';
import { PerformanceTracker } from './performance-tracker';
import { decisionAuditRepo } from './decision-audit-repository';
import { sendTelegramMessage } from '@/shared/telegram-bot';
import { Orchestrator } from '@/orchestrator/index';
import type { Orchestrator as OrchestratorType } from '@/orchestrator/index';

let _redisAvailable = false;
let _devTimer: ReturnType<typeof setInterval> | null = null;

// Phase 1 fix: Singleton QuantAgent untuk hindari WS leak + persistent risk state
let _quantAgentSingleton: QuantAgent | null = null;
let _orchestratorSingleton: OrchestratorType | null = null;

/**
 * Dipanggil dari main.ts untuk inject orchestrator singleton.
 */
export function setOrchestratorSingleton(orchestrator: OrchestratorType): void {
  _orchestratorSingleton = orchestrator;
}

export function getQuantAgentSingleton(client: IndodaxClient): QuantAgent {
  if (!_quantAgentSingleton) {
    _quantAgentSingleton = new QuantAgent(client);
  }
  return _quantAgentSingleton;
}

export const tradingCycleQueue = new Queue('trading-cycle', {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 * 24 },
    removeOnFail: { age: 3600 * 24 },
  },
});

async function checkRedisVersion(): Promise<boolean> {
  try {
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
    await redis.connect();
    const info = await redis.info('server');
    const match = info.match(/redis_version:(\d+)\./);
    const ver = match ? parseInt(match[1]!, 10) : 0;
    await redis.quit();
    _redisAvailable = ver >= 5;
    if (!_redisAvailable) {
      logger.warn({ version: ver }, 'Redis <5 detected — falling back to setInterval scheduler');
    }
    return _redisAvailable;
  } catch {
    logger.warn('Redis not reachable — falling back to setInterval scheduler');
    _redisAvailable = false;
    return false;
  }
}

export async function setupTradingScheduler(): Promise<void> {
  const ok = await checkRedisVersion();
  if (ok) {
    const repeatableJobs = await tradingCycleQueue.getRepeatableJobs();
    const existing = repeatableJobs.find(j => j.name === 'trading_cycle');
    if (!existing) {
      await tradingCycleQueue.add(
        'trading_cycle',
        {},
        {
          repeat: { pattern: '*/15 * * * *' },
          jobId: 'trading-cycle-repeating',
        },
      );
      logger.info('Trading cycle BullMQ scheduler registered (every 15 minutes)');
    } else {
      logger.info('Trading cycle BullMQ scheduler already registered');
    }
    return;
  }
  const intervalMs = 15 * 60 * 1000;
  _devTimer = setInterval(() => {
    executeTradingCycle().catch(err => logger.error({ error: err.message }, 'Dev trading cycle error'));
  }, intervalMs);
  logger.info({ intervalMs }, 'Trading cycle dev scheduler started (setInterval)');
}

export interface CycleResult {
  scanned: number;
  candidates: number;
  opened: number;
  monitored: number;
  errors: string[];
}

export async function executeTradingCycle(): Promise<CycleResult> {
  const result: CycleResult = { scanned: 0, candidates: 0, opened: 0, monitored: 0, errors: [] };

  // Phase 1 fix #2 + #5: Use orchestrator singleton if available (memory+context). Fallback to direct agent with shared singleton.
  if (_orchestratorSingleton) {
    // Route through orchestrator for full context + memory
    try {
      const response = await _orchestratorSingleton.run(
        'Execute trading cycle: scan market, evaluate opportunities, manage open positions',
        'system',
        'cron',
      );
      logger.info({ response }, 'Trading cycle via orchestrator completed (Phase 1 fix)');
      // Parse response to extract actions (TBD: define structured response)
    } catch (e) {
      const msg = (e as Error).message;
      result.errors.push(msg);
      logger.error({ error: msg }, 'Orchestrator cycle failed');
    }
    return result;
  }

  // Fallback: use singleton QuantAgent to avoid WS leak
  try {
        const client = new IndodaxClient();
        const agent = getQuantAgentSingleton(client);
        const repo = new TradeRepository();
        const executor = new PaperExecutor(repo, client);
        // Phase 1 fix: use actual performance data for compounding
        const perfTracker = new PerformanceTracker(repo);

        const accountId = await repo.getDefaultAccount();
    if (!accountId) {
      result.errors.push('No account found');
      return result;
    }

    const emergency = await agent.execute(
      { id: '', agent: 'quant', action: 'check_emergency', params: {}, dependsOn: [], async: false },
      {},
    ) as any;
    if (emergency?.isEmergency) {
      logger.warn({ reason: emergency.reason }, 'Emergency shield active — skipping new trades');
      result.errors.push(`Emergency: ${emergency.reason}`);
    } else {
      const scan = await agent.execute(
        { id: '', agent: 'quant', action: 'scan_market', params: { topN: 5 }, dependsOn: [], async: false },
        {},
      ) as any;
      result.scanned = scan?.length ?? 0;
      const candidates = (scan ?? []).slice(0, 3);
      result.candidates = candidates.length;

      for (const candidate of candidates) {
        try {
          const pair = candidate.pair ?? candidate.symbol;
          if (!pair) continue;
          const existingPos = await repo.getOpenPosition(pair, accountId);
          if (existingPos) continue;

          const ticker = await agent.execute(
            { id: '', agent: 'quant', action: 'get_ticker', params: { pair }, dependsOn: [], async: false },
            {},
          ) as any;
          const price = ticker?.ticker?.last ? Number(ticker.ticker.last) : 0;
          if (price <= 0) continue;

          const regime = await agent.execute(
            { id: '', agent: 'quant', action: 'get_macro_regime', params: {}, dependsOn: [], async: false },
            {},
          ) as any;

          const aiResult = await agent.execute(
            { id: '', agent: 'quant', action: 'analyze_with_ai', params: { pair }, dependsOn: [], async: false },
            {},
          ) as any;

          const alphaHunterScore = (candidate.totalScore as number) ?? 35;

          const score = await agent.execute(
            {
              id: '', agent: 'quant', action: 'score_opportunity',
              params: {
                pair,
                entryPrice: price,
                aiConsensusScore: aiResult?.score ?? 0,
                alphaHunterScore,
                regime: regime?.regime ?? 'NEUTRAL',
              },
              dependsOn: [], async: false,
            },
            {},
          ) as any;

          logger.info({
            pair,
            alphaHunterScore,
            aiScore: aiResult?.score,
            regime: regime?.regime,
            finalScore: score?.score,
            action: score?.action,
            reason: score?.reason,
          }, 'Candidate evaluated');

          // Phase 1: Immutable decision audit
          await decisionAuditRepo.logDecision({
            trigger: 'cron',
            domain: 'quant',
            action: 'score_opportunity',
            pair,
            inputContext: {
              alphaHunterScore,
              aiScore: aiResult?.score,
              regime: regime?.regime,
              entryPrice: price,
            },
            finalScore: score?.score,
            chosenAction: score?.action,
            rationale: score?.reason,
            confidence: score?.score ? score.score / 100 : undefined,
          });

if (score?.action === 'MARKET_BUY' || score?.action === 'LIMIT_ENTRY') {
             const balance = await repo.getAccountBalance(accountId);
             
             // Phase 1 fix: use actual performance data (dengan fallback konservatif)
             const perfReport = accountId ? await perfTracker.getReport(accountId) : null;
             const perf = perfReport?.weekly ?? perfReport?.monthly;

             const sizing = CompoundingEngine.calculatePositionSize({
               initialBalance: balance,
               currentBalance: balance,
               winRate: perf?.winRate ? perf.winRate : 0.45,        // fallback di bawah 50%
               avgWinPercent: perf?.avgPnlPerTrade ? Math.max(1, perf.avgPnlPerTrade) : 3, // fallback
               avgLossPercent: perf?.avgPnlPerTrade ? Math.abs(Math.min(perf.avgPnlPerTrade, -4)) : 4, // fallback
               reinvestRatio: 0.4, // konservatif untuk early stage
             });
             const riskAmount = balance * (sizing.riskPercent / 100);
             const quantity = String(riskAmount / price);
             const entryPrice = String(price);

            let sl: string | undefined;
            let tp1: string | undefined;
            let tp2: string | undefined;
            let tp3: string | undefined;
            if (score.atrTargets) {
              sl = String(score.atrTargets.sl);
              tp1 = String(score.atrTargets.tp1);
              tp2 = String(score.atrTargets.tp2);
              tp3 = score.atrTargets.tp3 ? String(score.atrTargets.tp3) : undefined;
            }

            const trade = await executor.openTrade({
              pair,
              side: 'buy',
              quantity,
              entryPrice,
              stopLoss: sl,
              takeProfit1: tp1,
              takeProfit2: tp2,
              takeProfit3: tp3,
            });

            if (trade.success) {
              result.opened++;
              logger.info({ pair, entry: entryPrice, score: score.score }, 'Trading cycle opened position');

              await decisionAuditRepo.logDecision({
                trigger: 'cron',
                domain: 'quant',
                action: 'paper_open',
                pair,
                inputContext: { entryPrice, quantity, riskAmount },
                chosenAction: 'PAPER_OPEN',
                outcome: { positionId: (trade as any).id ?? 'unknown' },
              });
            }
          }
        } catch (err) {
          const msg = (err as Error).message;
          result.errors.push(msg);
          logger.error({ candidate, error: msg }, 'Trading cycle candidate error');
        }
      }
    }

    await executor.monitorPositions(accountId);
    result.monitored = 1;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await repo.upsertStats(accountId, 'day', today);
  } catch (err) {
    const msg = (err as Error).message;
    result.errors.push(msg);
    logger.error({ error: msg }, 'Trading cycle failed');
  }

  // Phase 1: Telegram notification skeleton
  const summary = `Cycle: scanned=${result.scanned} candidates=${result.candidates} opened=${result.opened} errors=${result.errors.length}`;
  sendTelegramMessage(summary).catch(() => {});

  return result;
}
