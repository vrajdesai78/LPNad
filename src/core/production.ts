import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import createDebug from 'debug';
import express from 'express';

const debug = createDebug('bot:production');

const PORT = (process.env.PORT && parseInt(process.env.PORT, 10)) || 3000;
const DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;

const production = async (bot: Telegraf<Context<Update>>) => {
  debug('Bot runs in production mode');

  if (!DOMAIN) {
    throw new Error('DOMAIN environment variable is not set.');
  }

  const app = express();

  // Parse the raw body for webhook
  app.use(express.json());

  const webhookPath = '/webhook';
  const webhookUrl = `${DOMAIN}${webhookPath}`;

  // Get current webhook info
  const webhookInfo = await bot.telegram.getWebhookInfo();

  // Update webhook only if it's different
  if (webhookInfo.url !== webhookUrl) {
    debug(`deleting webhook`);
    await bot.telegram.deleteWebhook();
    debug(`setting webhook: ${webhookUrl}`);
    await bot.telegram.setWebhook(webhookUrl);
  }

  // Handle webhook requests
  app.post(webhookPath, (req, res) => {
    bot.handleUpdate(req.body as Update, res);
  });

  // Health check endpoint
  app.get('/', (req, res) => {
    res.send('Bot is running!');
  });

  // Start express server
  app.listen(PORT, () => {
    debug(`Server is running on port ${PORT}`);
    debug(`Webhook is set to ${webhookUrl}`);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

export { production };
