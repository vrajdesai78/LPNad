import { Telegraf } from "telegraf";
import {
  menuCallbackHandler,
  swapAmountHandler,
  positionTypeHandler,
} from "./handlers/menuHandlers";

/**
 * Register all callback handlers with the bot
 * @param bot The Telegraf bot instance
 */
export const registerCallbackHandlers = (bot: Telegraf) => {
  // Main menu callbacks
  bot.action(["wallet", "swap", "new_position"], menuCallbackHandler);

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

  // Log that handlers are registered
  console.log("Callback handlers registered");
};
