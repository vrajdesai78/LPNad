import { Telegraf } from "telegraf";
import { development, production } from "./core";
import { startCommand } from "./commands/start";
import {
  walletHandler,
  swapHandler,
  newPositionHandler,
  swapAmountHandler,
  positionTypeHandler,
  viewPositionsHandler,
} from "./handlers/menuHandlers";
import { registerCallbackHandlers } from "./callbackHandlers";
import { VercelRequest, VercelResponse } from "@vercel/node";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ENVIRONMENT = process.env.NODE_ENV || "";

// Create single bot instance
const bot = new Telegraf(BOT_TOKEN);

// Then start bot in development or production mode
if (ENVIRONMENT !== "production") {
  development(bot);
}

export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Register commands first
bot.start(startCommand);

// Register menu handlers for text commands
bot.hears("💰 Wallet", walletHandler);
bot.hears("🔄 Swap", swapHandler);
bot.hears("📈 New Position", newPositionHandler);
bot.hears("👁️ View Positions", viewPositionsHandler);

// Register text handlers for swap amounts
bot.hears(/^0\.\d+\s*mon$/i, swapAmountHandler);

// Register text handlers for position types
bot.hears(
  ["mon-usdc", "mon usdc", "mon-weth", "mon weth", "custom"],
  positionTypeHandler
);

// Register all callback handlers
registerCallbackHandlers(bot);

// Add action for manage_wallet button
bot.action("manage_wallet", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.telegram.sendMessage(ctx.from.id, "/wallet", {
    parse_mode: "Markdown",
  });
});
