import { Context } from "telegraf";
import { Markup } from "telegraf";
import { executeSwap } from "../core/swap";
import { createAndExecuteLPPosition } from "../core/position";
import { fetchPositions, formatPositionDetails } from "../core/positions";
import { handleCheckBalance } from "../services/wallet";
import redis from "../services/redis";

// Handler for wallet button
export const walletHandler = async (ctx: Context) => {
  try {
    await handleCheckBalance(ctx);
  } catch (error) {
    console.error("Error in wallet handler:", error);
    await ctx.reply(
      "Sorry, there was an error processing your wallet request."
    );
  }
};

// Handler for swap button
export const swapHandler = async (ctx: Context) => {
  try {
    // Show preset amount options as a grid in the message with callback buttons
    await ctx.reply(
      "🔄 *Swap MON to USDC*\n\n" +
        "Select amount to swap:\n\n" +
        "🔹 `0.0001 MON`  🔹 `0.001 MON`\n" +
        "🔹 `0.01 MON`    🔹 `0.1 MON`\n\n" +
        "Or type a custom amount (e.g., `0.05 MON`)",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("0.0001 MON", "swap_0.0001"),
            Markup.button.callback("0.001 MON", "swap_0.001"),
          ],
          [
            Markup.button.callback("0.01 MON", "swap_0.01"),
            Markup.button.callback("0.1 MON", "swap_0.1"),
          ],
          [Markup.button.callback("Custom Amount", "swap_custom")],
        ]),
      }
    );
  } catch (error) {
    console.error("Error in swap handler:", error);
    await ctx.reply("Sorry, there was an error processing your swap request.");
  }
};

// Handler for swap amount selection
export const swapAmountHandler = async (ctx: Context) => {
  try {
    let amount = "";

    // Handle callback query
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;

      if (data === "swap_custom") {
        await ctx.reply("Please enter the amount of MON you want to swap:");
        return;
      }

      // Extract amount from callback data
      amount = data.split("_")[1];
      await ctx.editMessageText(
        `Initiating swap of ${amount} MON to USDC... ⏳`
      );
    }
    // Handle text message
    else if (ctx.message && "text" in ctx.message) {
      const text = ctx.message.text.trim().toLowerCase();

      // Parse the amount from the text
      if (text === "0.0001 mon") {
        amount = "0.0001";
      } else if (text === "0.001 mon") {
        amount = "0.001";
      } else if (text === "0.01 mon") {
        amount = "0.01";
      } else if (text === "0.1 mon") {
        amount = "0.1";
      } else {
        // Try to extract a custom amount
        const match = text.match(/^(0\.\d+)\s*mon$/);
        if (match) {
          amount = match[1];
        } else {
          await ctx.reply(
            "Invalid amount format. Please use one of the preset amounts or specify a valid amount (e.g., '0.05 MON')."
          );
          return;
        }
      }

      await ctx.reply(`Initiating swap of ${amount} MON to USDC... ⏳`);
    } else {
      return;
    }

    // Execute the swap with the selected amount
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply("No user wallet found.");
      return;
    }
    await executeSwap("MON", amount, userId);

    await ctx.reply("Swap completed successfully! ✅");
  } catch (error) {
    console.error("Error in swap amount handler:", error);
    await ctx.reply("Sorry, there was an error processing your swap request.");
  }
};

// Handler for new position button
export const newPositionHandler = async (ctx: Context) => {
  try {
    // Show preset options for new position as a grid in the message with callback buttons
    await ctx.reply(
      "📈 *Create New Liquidity Position*\n\n" +
        "Select position type:\n\n" +
        "🔹 `MON-USDC`    🔹 `MON-WETH`\n\n" +
        "Or type `custom` for a custom pair",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("MON-USDC", "position_mon_usdc"),
            Markup.button.callback("MON-WETH", "position_mon_weth"),
          ],
          [Markup.button.callback("Custom Pair", "position_custom")],
        ]),
      }
    );
  } catch (error) {
    console.error("Error in new position handler:", error);
    await ctx.reply("Sorry, there was an error creating your new position.");
  }
};

// Handler for position type selection
export const positionTypeHandler = async (ctx: Context) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply("No user wallet found.");
      return;
    }

    // Handle callback query
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;

      if (data === "position_custom") {
        await ctx.reply("Custom pair selection is coming soon!");
        return;
      }

      // Extract pair from callback data
      const [token1, token2] = data.split("_").slice(1);

      await ctx.editMessageText(
        `Creating a new ${token1.toUpperCase()}-${token2.toUpperCase()} liquidity position... ⏳`
      );

      // Create and execute a new LP position
      const result = await createAndExecuteLPPosition(
        userId,
        "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d"
      );

      console.log("Result:", result);

      await ctx.reply("New position created successfully! ✅");
    }
    // Handle text message
    else if (ctx.message && "text" in ctx.message) {
      const text = ctx.message.text.trim().toLowerCase();

      if (text === "mon-usdc" || text === "mon usdc") {
        await ctx.reply(`Creating a new MON-USDC liquidity position... ⏳`);
        // Create and execute a new LP position
        await createAndExecuteLPPosition(
          userId,
          "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d"
        );
        await ctx.reply("New position created successfully! ✅");
      } else if (text === "mon-weth" || text === "mon weth") {
        await ctx.reply(`Creating a new MON-WETH liquidity position... ⏳`);
        // Create and execute a new LP position
        await createAndExecuteLPPosition(
          userId,
          "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d"
        );
        await ctx.reply("New position created successfully! ✅");
      } else if (text === "custom") {
        await ctx.reply("Custom pair selection is coming soon!");
      } else {
        await ctx.reply(
          "Invalid pair format. Please use one of the preset pairs (MON-USDC, MON-WETH) or type 'custom'."
        );
      }
    }
  } catch (error) {
    console.error("Error in position type handler:", error);
    await ctx.reply("Sorry, there was an error creating your new position.");
  }
};

// Handler for view positions button
export const viewPositionsHandler = async (ctx: Context) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply("No user wallet found.");
      return;
    }

    // Get the wallet address from Redis
    const walletAddress = await redis.get<string>(`wallet:${userId}:address`);

    if (!walletAddress) {
      await ctx.reply(
        "❌ No wallet found. Please create a wallet first using the /start command."
      );
      return;
    }

    await ctx.reply("🔍 Fetching your open positions... Please wait.");

    console.log("Fetching positions for wallet:", walletAddress);

    // Fetch positions for the wallet
    const positions = await fetchPositions(walletAddress);

    if (!positions || positions.length === 0) {
      await ctx.reply(
        "📊 *No Positions Found*\n\n" +
          "You don't have any open positions at the moment.\n\n" +
          "Create a new position using the '📈 New Position' option.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Send a message for each position with details
    for (let i = 0; i < Math.min(positions.length, 5); i++) {
      const position = positions[i];
      await ctx.reply(
        `📊 *Position ${i + 1} of ${positions.length}*\n${formatPositionDetails(
          position
        )}`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "📊 View on Uniswap",
                `view_position_${position.id}`
              ),
            ],
          ]),
        }
      );
    }

    // If there are more than 5 positions, just show a summary
    if (positions.length > 5) {
      await ctx.reply(
        `📊 *Position Summary*\n\n` +
          `You have ${positions.length} open positions in total.\n` +
          `Showing the first 5 positions only.`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Error in view positions handler:", error);
    await ctx.reply("Sorry, there was an error fetching your positions.");
  }
};

// Callback handlers for main menu buttons
export const menuCallbackHandler = async (ctx: Context) => {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle different callback actions
    switch (data) {
      case "wallet":
        await ctx.answerCbQuery("Opening wallet...");
        await walletHandler(ctx);
        break;
      case "swap":
        await ctx.answerCbQuery("Opening swap menu...");
        await swapHandler(ctx);
        break;
      case "new_position":
        await ctx.answerCbQuery("Opening new position menu...");
        await newPositionHandler(ctx);
        break;
      case "view_positions":
        await ctx.answerCbQuery("Opening view positions menu...");
        await viewPositionsHandler(ctx);
        break;
      default:
        await ctx.answerCbQuery("Unknown action");
    }
  } catch (error) {
    console.error("Error in menu callback handler:", error);
    await ctx.reply("Sorry, there was an error processing your request.");
  }
};
