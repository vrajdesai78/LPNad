import { Context, Markup } from "telegraf";
import { getOrCreateWallet, getWalletBalance } from "./wallet.service";

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
Balance: ${balance} ETH

What would you like to do?
`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("💰 Check Balance", `check_balance`)],
      [Markup.button.callback('🔑 Export Private Key', `export_key`)]
    ]),
  });
};

/**
 * Handle export private key action
 * @param ctx - Telegram context
 */
export const handleExportKey = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('Could not identify user.');
    return;
  }
  
  const wallet = await getOrCreateWallet(userId);
  
  // Send warning message
  const warningMsg = await ctx.reply(`
⚠️ *SECURITY WARNING* ⚠️

Your private key is about to be displayed. 
Never share this with anyone!
This message will self-destruct in 10 seconds.

\`${wallet.privateKey}\`
`, { parse_mode: 'Markdown' });

  // Delete the message after 5 seconds
  setTimeout(async () => {
    try {
      await ctx.deleteMessage(warningMsg.message_id);
      await ctx.reply("Private key message deleted for security. Keep your key safe!");
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }, 10000);
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
Balance: ${balance} ETH
`,
    { parse_mode: "Markdown" }
  );
};

/**
 * Register wallet-related actions
 * @param bot - Telegraf bot instance
 */
export const registerWalletActions = (bot: any) => {
  // Register wallet command
  bot.command("wallet", handleWalletCommand);

  // Register callback queries
  bot.action('export_key', handleExportKey);
  bot.action("check_balance", handleCheckBalance);
};
