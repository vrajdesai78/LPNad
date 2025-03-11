import { Context, Markup } from "telegraf";
import { getOrCreateWallet, hasWallet } from "../wallet";

export const startCommand = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Get or create a wallet for the user automatically
  const wallet = await getOrCreateWallet(userId);

  // Welcome message
  await ctx.reply(
    "Welcome to LPNad! 🚀\n\n" +
      `Your wallet address: \`${wallet.address}\`\n\n` +
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
