import { Context } from "telegraf";
import { Markup } from "telegraf";
import { executeSwap } from "../core/swap";
import type { TokenType } from "../core/swap";
import { createAndExecuteLPPosition } from "../core/position";
import { fetchPositions, formatPositionDetails } from "../core/positions";
import { handleCheckBalance } from "../services/wallet";
import redis from "../services/redis";
import { privateKeyToAccount } from "viem/accounts";
import { config as dotenv } from "dotenv";
import { getWallet } from "../core/wallet";

dotenv();

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
    // Ask for token selection first with a cleaner UI
    await ctx.reply(
      "🔄 *Swap MON to another token*\n\n" +
        "Select the token you want to swap to:",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("USDC", "token_USDC"),
            Markup.button.callback("USDT", "token_USDT"),
          ],
          [
            Markup.button.callback("MOLANDAK", "token_MOLANDAK"),
            Markup.button.callback("CHOG", "token_CHOG"),
          ],
          [Markup.button.callback("Custom Token", "token_CUSTOM")],
          [Markup.button.callback("« Back to Menu", "back_to_menu")],
        ]),
      }
    );
  } catch (error) {
    console.error("Error in swap handler:", error);
    await ctx.reply("Sorry, there was an error processing your swap request.");
  }
};

// Handler for token selection
export const tokenSelectionHandler = async (ctx: Context) => {
  try {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const data = ctx.callbackQuery.data;
    const tokenType = data.split("_")[1];

    // Store the selected token in Redis for this user
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply("No user ID found.");
      return;
    }

    // Handle custom token address input
    if (tokenType === "CUSTOM") {
      // Answer the callback but keep the token selection menu
      await ctx.answerCbQuery("Please enter the custom token contract address");

      // Send a follow-up message requesting the contract address
      await ctx.reply(
        "Please enter the contract address of the token you want to swap to:"
      );

      // Set a flag in Redis to indicate we're waiting for a custom address
      await redis.set(`user:${userId}:awaiting_custom_address`, "true");
      return;
    }

    // Store the selected token for this user
    await redis.set(`user:${userId}:selected_token`, tokenType);

    // Answer the callback query and update the message in place
    await ctx.answerCbQuery(`Selected ${tokenType}`);

    // Replace the token selection message with the amount selection
    if (ctx.callbackQuery.message) {
      try {
        await ctx.editMessageText(
          `🔄 *Swap MON to ${tokenType}*\n\n` +
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
        console.error("Error updating message:", error);
        // Fall back to sending a new message if editing fails
        await showSwapAmountOptions(ctx, tokenType);
      }
    } else {
      // If we can't edit, fall back to sending a new message
      await showSwapAmountOptions(ctx, tokenType);
    }
  } catch (error) {
    console.error("Error in token selection handler:", error);
    await ctx.reply(
      "Sorry, there was an error processing your token selection."
    );
  }
};

// Helper function to show swap amount options
const showSwapAmountOptions = async (ctx: Context, tokenType: string) => {
  await ctx.reply(
    `🔄 *Swap MON to ${tokenType}*\n\n` +
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
        [Markup.button.callback("« Change Token", "swap")],
      ]),
    }
  );
};

// Handler for custom token addresses
export const customTokenHandler = async (ctx: Context) => {
  if (!ctx.message || !("text" in ctx.message)) {
    return;
  }

  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("No user ID found.");
    return;
  }

  // Check if we're waiting for a custom address from this user
  const isAwaitingAddress = await redis.get(
    `user:${userId}:awaiting_custom_address`
  );
  if (isAwaitingAddress !== "true") {
    return;
  }

  const address = ctx.message.text.trim();

  // Very basic validation for Ethereum addresses
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    await ctx.reply(
      "Invalid Ethereum address format. Please enter a valid contract address."
    );
    return;
  }

  // Store the custom address
  await redis.set(`user:${userId}:custom_token_address`, address);
  await redis.set(`user:${userId}:selected_token`, "CUSTOM");

  // Clear the awaiting flag
  await redis.del(`user:${userId}:awaiting_custom_address`);

  // Send confirmation and show amount options
  const confirmationMsg = await ctx.reply(
    `Custom token address set: ${address}`
  );

  // Wait a short time then delete the confirmation message to clean up the chat
  setTimeout(async () => {
    try {
      if (ctx.chat && "message_id" in confirmationMsg) {
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          confirmationMsg.message_id
        );
      }
    } catch (error) {
      console.log("Could not delete confirmation message:", error);
    }
  }, 2000); // 2 seconds delay

  // Show amount options
  await showSwapAmountOptions(ctx, "Custom Token");
};

// Handler for swap amount selection
export const swapAmountHandler = async (ctx: Context) => {
  try {
    let amount = "";
    let statusMessageId: number | undefined;

    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply("No user wallet found.");
      return;
    }

    // Get the selected token for this user
    const selectedToken = await redis.get(`user:${userId}:selected_token`);
    if (!selectedToken) {
      await ctx.reply(
        "No token selected. Please start the swap process again."
      );
      return;
    }

    // Get custom token address if applicable
    let customTokenAddress: string | undefined;
    if (selectedToken === "CUSTOM") {
      const redisResult = await redis.get(
        `user:${userId}:custom_token_address`
      );
      customTokenAddress =
        typeof redisResult === "string" ? redisResult : undefined;
      if (!customTokenAddress) {
        await ctx.reply(
          "Custom token address not found. Please start the swap process again."
        );
        return;
      }
    }

    // Handle callback query
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;

      if (data === "swap_custom") {
        await ctx.reply("Please enter the amount of MON you want to swap:");
        return;
      }

      // Extract amount from callback data
      amount = data.split("_")[1];
      const tokenDisplay =
        selectedToken === "CUSTOM" ? "Custom Token" : selectedToken;

      // Update the message in place instead of sending a new one
      await ctx.editMessageText(
        `Initiating swap of ${amount} MON to ${tokenDisplay}... ⏳`
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

      const tokenDisplay =
        selectedToken === "CUSTOM" ? "Custom Token" : selectedToken;

      // Send status message and store its ID
      const statusMsg = await ctx.reply(
        `Initiating swap of ${amount} MON to ${tokenDisplay}... ⏳`
      );

      // Store message ID if available
      if ("message_id" in statusMsg) {
        statusMessageId = statusMsg.message_id;
      }
    } else {
      return;
    }

    // Execute the swap with the selected amount and token
    const swapResult = await executeSwap(
      "MON",
      amount,
      userId,
      selectedToken as TokenType,
      customTokenAddress
    );

    // Delete status message if we have its ID
    if (statusMessageId && ctx.chat) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMessageId);
      } catch (error) {
        console.log("Could not delete status message:", error);
      }
    }

    // Include explorer link in the success message
    await ctx.reply(
      `Swap completed successfully! ✅\n\n🔍 [View transaction on Explorer](${swapResult.explorerUrl})`,
      {
        parse_mode: "Markdown",
        link_preview_options: {
          is_disabled: true,
        },
      }
    );

    // Clear the stored token selection
    await redis.del(`user:${userId}:selected_token`);
    if (selectedToken === "CUSTOM") {
      await redis.del(`user:${userId}:custom_token_address`);
    }
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

      // Edit the message in place to show status
      await ctx.editMessageText(
        `Creating a new ${token1.toUpperCase()}-${token2.toUpperCase()} liquidity position... ⏳`
      );

      // Create and execute a new LP position
      const result = await createAndExecuteLPPosition(
        userId,
        "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d"
      );

      await ctx.reply(
        `New position created successfully! ✅\n\n🔍 [View transaction on Explorer](${result.explorerUrl})`,
        {
          parse_mode: "Markdown",
          link_preview_options: {
            is_disabled: true,
          },
        }
      );
    }
    // Handle text message
    else if (ctx.message && "text" in ctx.message) {
      const text = ctx.message.text.trim().toLowerCase();
      let statusMessageId: number | undefined;

      if (text === "mon-usdc" || text === "mon usdc") {
        // Send status message and store its ID
        const statusMsg = await ctx.reply(
          `Creating a new MON-USDC liquidity position... ⏳`
        );

        // Store message ID if available
        if ("message_id" in statusMsg) {
          statusMessageId = statusMsg.message_id;
        }

        // Create and execute a new LP position
        const result = await createAndExecuteLPPosition(
          userId,
          "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d"
        );

        // Delete status message if we have its ID
        if (statusMessageId && ctx.chat) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMessageId);
          } catch (error) {
            console.log("Could not delete status message:", error);
          }
        }

        await ctx.reply(
          `New position created successfully! ✅\n\n🔍 [View transaction on Explorer](${result.explorerUrl})`,
          {
            parse_mode: "Markdown",
            link_preview_options: {
              is_disabled: true,
            },
          }
        );
      } else if (text === "mon-weth" || text === "mon weth") {
        // Send status message and store its ID
        const statusMsg = await ctx.reply(
          `Creating a new MON-WETH liquidity position... ⏳`
        );

        // Store message ID if available
        if ("message_id" in statusMsg) {
          statusMessageId = statusMsg.message_id;
        }

        // Create and execute a new LP position
        const result = await createAndExecuteLPPosition(
          userId,
          "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d"
        );

        // Delete status message if we have its ID
        if (statusMessageId && ctx.chat) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMessageId);
          } catch (error) {
            console.log("Could not delete status message:", error);
          }
        }

        await ctx.reply(
          `New position created successfully! ✅\n\n🔍 [View transaction on Explorer](${result.explorerUrl})`,
          {
            parse_mode: "Markdown",
            link_preview_options: {
              is_disabled: true,
            },
          }
        );
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

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.reply(
        "❌ No wallet found. Please create a wallet first using the /start command."
      );
      return;
    }
    const walletAddress = wallet.address;

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
