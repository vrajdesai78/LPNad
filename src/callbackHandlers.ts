import { Telegraf } from "telegraf";
import {
  menuCallbackHandler,
  swapAmountHandler,
  positionTypeHandler,
  viewPositionsHandler,
  tokenSelectionHandler,
  customTokenHandler,
} from "./handlers/menuHandlers";
import { Markup } from "telegraf";

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

  // Back to menu button
  bot.action("back_to_menu", async (ctx) => {
    try {
      await ctx.answerCbQuery("Returning to main menu");

      // Create a new menu message with the main options
      await ctx.editMessageText(
        "Welcome to LPNad! 🚀\n\n" +
          "*Menu Options:*\n\n" +
          "💰 Wallet - Check balance\n" +
          "📈 New Position - Open liquidity position\n" +
          "👁️ View Positions - See your open positions\n" +
          "🔄 Swap - Exchange tokens\n\n" +
          "Select an option below or type the name:",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("💰 Wallet", "wallet"),
              Markup.button.callback("🔄 Swap", "swap"),
            ],
            [
              Markup.button.callback("📈 New Position", "new_position"),
              Markup.button.callback("👁️ View Positions", "view_positions"),
            ],
          ]),
        }
      );
    } catch (error) {
      console.error("Error handling back to menu:", error);
      await ctx.reply("Sorry, there was an error returning to the menu.");
    }
  });

  // Token selection callbacks
  bot.action(
    [
      "token_USDC",
      "token_USDT",
      "token_MOLANDAK",
      "token_CHOG",
      "token_CUSTOM",
    ],
    tokenSelectionHandler
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
