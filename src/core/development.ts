import { Context, Telegraf } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";
import createDebug from "debug";
import { config as dotenv } from "dotenv";

dotenv();

const debug = createDebug("bot:dev");

export const development = async (bot: Telegraf<Context<Update>>) => {
  const botInfo = (await bot.telegram.getMe()).username;

  debug("Bot runs in development mode");
  debug(`${botInfo} deleting webhook`);
  await bot.telegram.deleteWebhook();
  debug(`${botInfo} starting polling`);

  await bot.launch();

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
};

export const createDevelopmentBot = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("BOT_TOKEN environment variable is required");
  }

  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  return bot;
};
