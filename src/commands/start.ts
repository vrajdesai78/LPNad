import { Context, Markup } from "telegraf";
import { getOrCreateWallet } from "../core/wallet";
import { getWalletBalanceWithUSD } from "../services/wallet";

export const startCommand = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Get or create a wallet for the user automatically
  const wallet = await getOrCreateWallet(userId);

  // Get the wallet balance with USD value
  const { monBalance, usdValue } = await getWalletBalanceWithUSD(
    wallet.address
  );
  const formattedBalance = parseFloat(monBalance).toFixed(4);

  // Welcome message
  await ctx.reply(
    "Welcome to LPNad! 🚀\n\n" +
      `Your wallet address: \`${wallet.address}\`\n` +
      `Balance: ${formattedBalance} MON (≈ $${usdValue} USD)\n\n` +
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
};
