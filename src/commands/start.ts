import { Context, Markup } from "telegraf";
import { getOrCreateWallet, hasWallet } from "../wallet";

export const startCommand = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Welcome message
  await ctx.reply("Welcome to LPNad!");

  // Get or create a wallet for the user automatically
  const wallet = await getOrCreateWallet(userId);
  
  // Send wallet address to user
  await ctx.reply(`
Your wallet address:

\`${wallet.address}\`

You can copy this address to receive funds. Use /wallet to check your balance.
`, { parse_mode: 'Markdown' });
};
