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
  customTokenHandler,
} from "./handlers/menuHandlers";
import { registerCallbackHandlers } from "./callbackHandlers";
import { VercelRequest, VercelResponse } from "@vercel/node";
import { startSingleAddressMonitoring } from "./services/avalancheMonitor";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ENVIRONMENT = process.env.NODE_ENV || "";

// Create single bot instance
const bot = new Telegraf(BOT_TOKEN);

// Then start bot in development or production mode
if (ENVIRONMENT !== "production") {
  development(bot);
}

// Start monitoring for all users automatically
startSingleAddressMonitoring()
  .then(() => {
    console.log("Automatic balance monitoring started successfully");
  })
  .catch((error) => {
    console.error(`Failed to start automatic balance monitoring: ${error}`);
  });

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

// Register handler for Ethereum addresses (custom tokens)
bot.hears(/^0x[a-fA-F0-9]{40}$/, customTokenHandler);

// Register text handlers for position types
bot.hears(
  [
    "mon-usdc",
    "mon usdc",
    "mon-weth",
    "mon weth",
    "custom",
    "usdt-eth",
    "usdt eth",
  ],
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
