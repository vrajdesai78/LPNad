import { Context, Markup } from "telegraf";
import { getWalletBalance, getOrCreateWallet } from "../core/wallet";

/**
 * Handle the wallet command
 * @param ctx - Telegram context
 */
export const handleWalletCommand = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  // Get or create wallet automatically
  const wallet = await getOrCreateWallet(userId);
  const balance = await getWalletBalance(wallet.address);

  const message = `
💼 *Your Wallet*

Address: \`${wallet.address}\`
Balance: ${balance} MON

What would you like to do?
`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("💰 Check Balance", `check_balance`)],
    ]),
  });
};

/**
 * Handle check balance action
 * @param ctx - Telegram context
 */
export const handleCheckBalance = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  const wallet = await getOrCreateWallet(userId);
  const balance = await getWalletBalance(wallet.address);

  await ctx.reply(
    `
💰 *Wallet Balance*

Address: \`${wallet.address}\`
Balance: ${balance} MON
`,
    { parse_mode: "Markdown" }
  );
};
