import { Context } from "telegraf";
import { Markup } from "telegraf";
import { executeSwap } from "../core/swap";
import { createAndExecuteLPPosition } from "../core/position";
import { handleCheckBalance } from "../services/wallet";

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
    await executeSwap("MON", amount);

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
      await createAndExecuteLPPosition(
        "0xd2790DdD12305551c2c055581B993029232a1202"
      );

      await ctx.reply("New position created successfully! ✅");
    }
    // Handle text message
    else if (ctx.message && "text" in ctx.message) {
      const text = ctx.message.text.trim().toLowerCase();

      if (text === "mon-usdc" || text === "mon usdc") {
        await ctx.reply(`Creating a new MON-USDC liquidity position... ⏳`);
        // Create and execute a new LP position
        await createAndExecuteLPPosition(
          "0xd2790DdD12305551c2c055581B993029232a1202"
        );
        await ctx.reply("New position created successfully! ✅");
      } else if (text === "mon-weth" || text === "mon weth") {
        await ctx.reply(`Creating a new MON-WETH liquidity position... ⏳`);
        // Create and execute a new LP position
        await createAndExecuteLPPosition(
          "0xd2790DdD12305551c2c055581B993029232a1202"
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
      default:
        await ctx.answerCbQuery("Unknown action");
    }
  } catch (error) {
    console.error("Error in menu callback handler:", error);
    await ctx.reply("Sorry, there was an error processing your request.");
  }
};
