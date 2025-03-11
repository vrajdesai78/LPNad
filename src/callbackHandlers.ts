import { Telegraf } from "telegraf";
import {
  menuCallbackHandler,
  swapAmountHandler,
  positionTypeHandler,
  viewPositionsHandler,
} from "./handlers/menuHandlers";

/**
 * Register all callback handlers with the bot
 * @param bot The Telegraf bot instance
 */
export const registerCallbackHandlers = (bot: Telegraf) => {
  // Main menu callbacks
  bot.action(
    ["wallet", "swap", "new_position", "view_positions"],
    menuCallbackHandler
  );

  // Swap amount callbacks
  bot.action(
    ["swap_0.0001", "swap_0.001", "swap_0.01", "swap_0.1", "swap_custom"],
    swapAmountHandler
  );

  // Position type callbacks
  bot.action(
    ["position_mon_usdc", "position_mon_weth", "position_custom"],
    positionTypeHandler
  );

  // Position view callback
  bot.action(/^view_position_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();

      // Extract position ID from the callback data
      const positionId = ctx.match[1];

      // Generate Uniswap position URL
      const uniswapUrl = `https://app.uniswap.org/pool/${positionId}`;

      await ctx.reply(`🔗 View your position on Uniswap: ${uniswapUrl}`);
    } catch (error) {
      console.error("Error in view position callback:", error);
      await ctx.reply(
        "Sorry, there was an error generating the position link."
      );
    }
  });

  // Log that handlers are registered
  console.log("Callback handlers registered");
};
