import { Telegraf } from "telegraf";

// Get the bot token from environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Create a singleton bot instance for use across the application
const bot = new Telegraf(BOT_TOKEN);

// Valid parse modes for Telegram
type ParseMode = "Markdown" | "MarkdownV2" | "HTML";

/**
 * Send a message to a specific Telegram user by their user ID
 *
 * @param userId - The Telegram user ID to send the message to
 * @param message - The message text to send
 * @param options - Additional options for the message (like parse mode, etc.)
 * @returns Promise that resolves when the message is sent
 */
export const sendMessageToUser = async (
  userId: number,
  message: string,
  options: { parse_mode?: ParseMode } = {}
): Promise<void> => {
  try {
    await bot.telegram.sendMessage(userId, message, {
      parse_mode: "Markdown" as ParseMode,
      ...options,
    });
  } catch (error) {
    console.error(`Failed to send message to user ${userId}:`, error);
  }
};

export default {
  sendMessageToUser,
};
