import { Telegraf } from 'telegraf';
import { env } from '@/config/index';
import { logger } from '@/shared/logger';
import { executeTradingCycle } from '@/agents/quant/trading-scheduler';

let bot: Telegraf | null = null;

export function getTelegramBot(): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return null;
  }
  if (!bot) {
    bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

    // Basic commands for Phase 1
    bot.command('start', (ctx) => ctx.reply('Asisten Trading Bot active. Paper mode. Use /status or /cycle'));
    bot.command('status', async (ctx) => {
      ctx.reply('Paper trading active. Last cycle not tracked yet. (TODO: integrate metrics)');
    });
    bot.command('cycle', async (ctx) => {
      ctx.reply('Triggering manual trading cycle (paper)...');
      try {
        const result = await executeTradingCycle();
        ctx.reply(`Cycle done: scanned=${result.scanned}, opened=${result.opened}, errors=${result.errors.length}`);
      } catch (e) {
        ctx.reply(`Cycle error: ${(e as Error).message}`);
      }
    });

    bot.catch((err, ctx) => {
      logger.error({ error: (err as Error).message }, 'Telegram bot error');
      ctx.reply('Bot error occurred.');
    });

    bot.launch().then(() => {
      logger.info('Telegram bot launched (Phase 1 skeleton)');
    }).catch((e) => logger.error({ error: e.message }, 'Failed to launch Telegram bot'));

    // Graceful stop
    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));
  }
  return bot;
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const b = getTelegramBot();
  if (!b) return;
  try {
    // Send to default chat if configured, or log
    const chatId = env.TELEGRAM_CHAT_ID;
    if (chatId) {
      await b.telegram.sendMessage(chatId, text);
    } else {
      logger.info({ text }, 'Telegram (no chatId set, would send)');
    }
  } catch (e) {
    logger.error({ error: (e as Error).message }, 'Failed to send Telegram message');
  }
}
