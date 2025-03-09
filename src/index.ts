import { Telegraf } from "telegraf";
import { development, production } from "./core";
import { startCommand } from "./commands/start";
import { VercelRequest } from "@vercel/node";
import { VercelResponse } from "@vercel/node";
import { registerWalletActions } from "./wallet";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ENVIRONMENT = process.env.NODE_ENV || "";

const bot = new Telegraf(BOT_TOKEN);

// Start bot in development or production mode
ENVIRONMENT !== "production" && development(bot);

export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Register start command
bot.start(startCommand);

// Register wallet actions
registerWalletActions(bot);

// Add action for manage_wallet button
bot.action("manage_wallet", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.telegram.sendMessage(ctx.from.id, "/wallet", {
    parse_mode: "Markdown",
  });
});
