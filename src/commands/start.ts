import { Context } from "telegraf";
import { Markup } from "telegraf";

export const startCommand = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.reply(
    "Welcome to LPNad! 🚀\n\n" +
      "*Menu Options:*\n\n" +
      "💰 `Wallet`       - Check balance\n" +
      "📈 `New Position` - Open liquidity position\n" +
      "🔄 `Swap`         - Exchange tokens\n\n" +
      "Select an option below or type the name:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("💰 Wallet", "wallet"),
          Markup.button.callback("🔄 Swap", "swap"),
        ],
        [Markup.button.callback("📈 New Position", "new_position")],
      ]),
    }
  );
};
