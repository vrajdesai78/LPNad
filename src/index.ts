import { Telegraf } from "telegraf";
import { development, production } from "./core";
import { startCommand } from "./commands/start";
import { VercelRequest } from "@vercel/node";
import { VercelResponse } from "@vercel/node";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ENVIRONMENT = process.env.NODE_ENV || "";

const bot = new Telegraf(BOT_TOKEN);

// Start bot in development or production mode
ENVIRONMENT !== "production" && development(bot);

export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

// Register start command
bot.start(startCommand);
