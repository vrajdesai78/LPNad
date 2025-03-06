import { Telegraf } from 'telegraf';
import { development, production } from './core';
import { startCommand } from './commands/start';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

const bot = new Telegraf(BOT_TOKEN);

// Register start command
bot.start(startCommand);

// Start bot in development or production mode
ENVIRONMENT !== 'production' && development(bot);
ENVIRONMENT === 'production' && production(bot);
