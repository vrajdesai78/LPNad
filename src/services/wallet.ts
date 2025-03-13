import { Context, Markup } from "telegraf";
import { getWalletBalance, getOrCreateWallet } from "../core/wallet";
import { getMonPrice } from "../core/pyth";

/**
 * Get wallet balance with USD value
 * @param address - Wallet address
 * @returns Balance in MON and USD value
 */
export const getWalletBalanceWithUSD = async (address: string) => {
  // Get MON balance
  const monBalance = await getWalletBalance(address);

  // Get MON price in USD
  const monPriceData = await getMonPrice();

  // Calculate USD value
  let usdValue = "N/A";
  if (monPriceData.price !== undefined && monPriceData.decimals !== undefined) {
    const monPriceUSD =
      Number(monPriceData.price) / Math.pow(10, Number(monPriceData.decimals));
    const balanceNum = parseFloat(monBalance);
    const usdValueNum = balanceNum * monPriceUSD;
    usdValue = usdValueNum.toFixed(2);
  }

  return {
    monBalance,
    usdValue,
  };
};

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
  const { monBalance, usdValue } = await getWalletBalanceWithUSD(
    wallet.address
  );

  const message = `
💼 *Your Wallet*

Address: \`${wallet.address}\`
Balance: ${monBalance} MON (≈ $${usdValue} USD)

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
  const { monBalance, usdValue } = await getWalletBalanceWithUSD(
    wallet.address
  );

  await ctx.reply(
    `
💰 *Wallet Balance*

Address: \`${wallet.address}\`
Balance: ${monBalance} MON (≈ $${usdValue} USD)
`,
    { parse_mode: "Markdown" }
  );
};
