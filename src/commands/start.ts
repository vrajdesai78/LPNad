import { Context } from "telegraf";

export const startCommand = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.reply("Welcome to LPNad!");
};
