import { config as dotenvConfig } from "dotenv";
import {
  createWalletClient,
  http,
  parseEther,
  encodeFunctionData,
  formatEther,
  createPublicClient,
  maxUint256,
  parseUnits,
} from "viem";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { nonfungiblePositionManagerAbi } from "../utils/abi/nonfungiblePositionManager-abi";
import { wmonAbi } from "../utils/abi/wmon-abi";
import { usdtAbi } from "../utils/abi/usdt-abi";

// Load environment variables
dotenvConfig();

// Constants
const POSITION_MANAGER_ADDRESS = "0x3dCc735C74F10FE2B9db2BB55C40fbBbf24490f7";
const USDT_ADDRESS = "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D";
const WMON_ADDRESS = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";

// Fee tier options: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%)
const FEE_TIER = 3000; // 0.3% fee tier

// Use a more concentrated range for better capital efficiency
// For testnet we'll use a narrower range around the current price
const MIN_TICK = -60 * 50; // Approximately -50% from current price
const MAX_TICK = 60 * 50; // Approximately +50% from current price

// Tick spacing is determined by the fee tier (higher fee = wider spacing)
const TICK_SPACING = 60; // For 0.3% fee tier

// Amount to deposit - WMON and USDT with different decimal places
// WMON: 18 decimals, USDT: 6 decimals
const WMON_DEPOSIT_AMOUNT = parseEther("0.05"); // 0.05 WMON
const USDT_DECIMALS = 6;
// For testnet, using 50 USDT which is 1000x the WMON amount to simulate a price of 1000 USDT per WMON
const USDT_DEPOSIT_AMOUNT = parseUnits("50", USDT_DECIMALS); // 50 USDT (price ~1000 USDT/WMON)

// Current price estimate for testnet (USDT per WMON)
const PRICE_ESTIMATE = 1000; // 1 WMON = 1000 USDT

// Helper function to calculate sqrtPriceX96 for pool price
function encodePriceX96(
  price: number,
  token0Decimals: number,
  token1Decimals: number
): bigint {
  // Adjust for decimal differences
  const decimalAdjustment = 10 ** (token1Decimals - token0Decimals);
  const adjustedPrice = price / decimalAdjustment;

  // For sqrtPriceX96, we need to:
  // 1. Take the square root of the price
  // 2. Multiply by 2^96
  const sqrtPrice = Math.sqrt(adjustedPrice);
  const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * 2 ** 96));

  return sqrtPriceX96;
}

// Create wallet client from private key
if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY not found in environment variables");
}

// Utility function to wait for a transaction to be confirmed
async function waitForTransaction(publicClient: any, hash: `0x${string}`) {
  console.log(`Waiting for transaction ${hash} to be confirmed...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

// Function to approve tokens for spending with better error handling
async function approveToken(
  publicClient: any,
  walletClient: any,
  tokenAddress: `0x${string}`,
  tokenName: string,
  tokenAbi: any,
  spenderAddress: `0x${string}`,
  amount: bigint,
  maxRetries = 3
) {
  const tokenContract = {
    address: tokenAddress,
    abi: tokenAbi,
  };

  try {
    // Get current decimals for logging purposes
    let decimals = 18;
    try {
      const tokenDecimals = await publicClient.readContract({
        ...tokenContract,
        functionName: "decimals",
      });
      decimals = Number(tokenDecimals);
      console.log(`${tokenName} has ${decimals} decimals`);
    } catch (error) {
      console.warn(`Could not read decimals for ${tokenName}, assuming 18`);
    }

    const allowance = await publicClient.readContract({
      ...tokenContract,
      functionName: "allowance",
      args: [walletClient.account.address, spenderAddress],
    });

    console.log(`Current ${tokenName} allowance: ${allowance}`);

    if ((allowance as bigint) < amount) {
      console.log(
        `Approving ${amount.toString()} of ${tokenName} (${tokenAddress})...`
      );

      let retries = 0;
      let success = false;

      // If USDT, we'll try a different approach if the first one fails
      if (tokenAddress.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
        try {
          // First try: Reset to 0 (some tokens require this)
          console.log(
            "First resetting allowance to 0 (required by some tokens)..."
          );
          const { request: resetRequest } = await publicClient.simulateContract(
            {
              ...tokenContract,
              functionName: "approve",
              args: [spenderAddress, 0n],
            }
          );

          const resetHash = await walletClient.writeContract(resetRequest);
          console.log(`Reset approval transaction hash: ${resetHash}`);

          await waitForTransaction(publicClient, resetHash);
          console.log("Allowance reset to 0");
        } catch (error) {
          console.warn("Could not reset allowance to 0, continuing anyway");
        }
      }

      while (retries < maxRetries && !success) {
        try {
          // Try approving with different amounts if we encounter errors
          let approvalAmount = amount;
          if (retries > 0) {
            // Try with smaller amount or max uint256 on retry
            approvalAmount = retries === 1 ? amount / 2n : maxUint256;
            console.log(
              `Retry ${retries}: Approving with different amount ${approvalAmount.toString()}`
            );
          }

          const { request } = await publicClient.simulateContract({
            ...tokenContract,
            functionName: "approve",
            args: [spenderAddress, approvalAmount],
          });

          const hash = await walletClient.writeContract(request);
          console.log(`Approval transaction hash: ${hash}`);

          const receipt = await waitForTransaction(publicClient, hash);
          if (receipt.status === "success") {
            console.log("Approval confirmed");
            success = true;
          } else {
            console.error("Approval transaction failed");
            retries++;
          }
        } catch (error) {
          console.error(`Error approving ${tokenName}:`, error);
          retries++;

          if (retries >= maxRetries) {
            throw new Error(
              `Failed to approve ${tokenName} after ${maxRetries} retries`
            );
          }
        }
      }

      return success;
    }

    console.log(
      `${tokenName} already approved for at least ${amount.toString()}`
    );
    return true;
  } catch (error) {
    console.error(`Error in approve flow for ${tokenName}:`, error);
    throw error;
  }
}

// Function to mint a new position
async function mintNewPosition(
  publicClient: any,
  walletClient: any,
  token0: `0x${string}`,
  token1: `0x${string}`,
  token0Name: string,
  token1Name: string,
  token0Abi: any,
  token1Abi: any,
  amount0Desired: bigint,
  amount1Desired: bigint
) {
  console.log("Preparing to mint new Uniswap V3 position...");

  // First, approve both tokens for spending
  console.log("Approving tokens for spending...");

  // For token0, we need to approve if it's not being sent as native MON
  // (which is only possible if token0 is WMON and we're using unwrapped MON)
  if (token0.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
    // If token0 is WMON, we have two options:
    // 1. Send pre-approved WMON tokens
    // 2. Send native MON with the transaction (not supported for token0 in Uniswap V3)
    // We'll go with option 1 for token0
    console.log(`Approving ${token0Name} as token0`);
    await approveToken(
      publicClient,
      walletClient,
      token0,
      token0Name,
      token0Abi,
      POSITION_MANAGER_ADDRESS as `0x${string}`,
      amount0Desired
    );
  } else {
    // If token0 is not WMON (e.g., it's USDT), we need to approve it
    console.log(`Approving ${token0Name} as token0`);
    await approveToken(
      publicClient,
      walletClient,
      token0,
      token0Name,
      token0Abi,
      POSITION_MANAGER_ADDRESS as `0x${string}`,
      amount0Desired
    );
  }

  // For token1, we can either approve it or send native MON if it's WMON
  if (token1.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
    // If token1 is WMON, we can send native MON with the transaction
    console.log(`Will send ${token1Name} as native MON, no approval needed`);
  } else {
    // If token1 is not WMON (e.g., it's USDT), we need to approve it
    console.log(`Approving ${token1Name} as token1`);
    await approveToken(
      publicClient,
      walletClient,
      token1,
      token1Name,
      token1Abi,
      POSITION_MANAGER_ADDRESS as `0x${string}`,
      amount1Desired
    );
  }

  // Get token decimals
  let token0Decimals = 18;
  let token1Decimals = 6;

  try {
    const decimals0 = await publicClient.readContract({
      address: token0,
      abi: token0Abi,
      functionName: "decimals",
    });
    token0Decimals = Number(decimals0);
    console.log(`${token0Name} has ${token0Decimals} decimals`);
  } catch (error) {
    console.warn(`Could not read decimals for ${token0Name}, assuming 18`);
  }

  try {
    const decimals1 = await publicClient.readContract({
      address: token1,
      abi: token1Abi,
      functionName: "decimals",
    });
    token1Decimals = Number(decimals1);
    console.log(`${token1Name} has ${token1Decimals} decimals`);
  } catch (error) {
    console.warn(`Could not read decimals for ${token1Name}, assuming 6`);
  }

  const tickLower = Math.floor(MIN_TICK / TICK_SPACING) * TICK_SPACING;
  const tickUpper = Math.floor(MAX_TICK / TICK_SPACING) * TICK_SPACING;

  console.log(`Using tick range: ${tickLower} to ${tickUpper}`);
  console.log(`Fee tier: ${FEE_TIER / 10000}%`);

  // Calculate the price based on token order
  // If WMON is token0, price = USDT/WMON
  // If USDT is token0, price = WMON/USDT (inverted)
  let price: number;
  if (token0.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
    // WMON is token0, price = USDT/WMON
    price = PRICE_ESTIMATE;
    console.log(`Using price: ${price} USDT per WMON`);
  } else {
    // USDT is token0, price = WMON/USDT (invert the price)
    price = 1 / PRICE_ESTIMATE;
    console.log(`Using price: ${price} WMON per USDT`);
  }

  // Calculate sqrtPriceX96 based on the price and token decimals
  const sqrtPriceX96 = encodePriceX96(price, token0Decimals, token1Decimals);
  console.log(`Using sqrtPriceX96: ${sqrtPriceX96}`);

  // Try to create and initialize the pool first
  try {
    console.log("Attempting to initialize pool first...");
    const { request: initPoolRequest } = await publicClient.simulateContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: nonfungiblePositionManagerAbi,
      functionName: "createAndInitializePoolIfNecessary",
      args: [token0, token1, FEE_TIER, sqrtPriceX96],
    });

    const initPoolHash = await walletClient.writeContract(initPoolRequest);
    console.log(`Pool initialization tx hash: ${initPoolHash}`);
    await waitForTransaction(publicClient, initPoolHash);
    console.log("Pool initialization successful");
  } catch (error) {
    console.log(
      "Pool initialization failed or pool already exists, continuing with position creation"
    );
    console.log("Error details:", error);
  }

  // Prepare mint position call
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  // Set minimum amounts to zero to bypass slippage checks
  console.log(`Amount0Desired: ${amount0Desired} ${token0Name}`);
  console.log(`Amount1Desired: ${amount1Desired} ${token1Name}`);
  console.log(`Using zero minimum amounts to bypass slippage checks`);

  try {
    console.log("Creating position using multicall...");

    // Prepare the calls for the multicall
    const calls: `0x${string}`[] = [];

    // Create mint parameters
    const mintParams = {
      token0,
      token1,
      fee: FEE_TIER,
      tickLower,
      tickUpper,
      amount0Desired,
      amount1Desired,
      amount0Min: 0n, // Set to 0 to bypass slippage check
      amount1Min: 0n, // Set to 0 to bypass slippage check
      recipient: walletClient.account.address,
      deadline,
    };

    // Encode the mint function
    const mintCall = encodeFunctionData({
      abi: nonfungiblePositionManagerAbi,
      functionName: "mint",
      args: [mintParams],
    });
    calls.push(mintCall);

    // Add refundETH call if we're sending native MON
    if (token1.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
      const refundETHCall = encodeFunctionData({
        abi: nonfungiblePositionManagerAbi,
        functionName: "refundETH",
        args: [],
      });
      calls.push(refundETHCall);
    }

    // Determine if we need to send ETH with the transaction
    // Only needed if token1 is WMON
    let value = 0n;
    if (token1.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
      value = amount1Desired;
      console.log(
        `Sending ${formatEther(
          value
        )} MON with transaction to be wrapped as WMON for token1`
      );
    }

    // Execute the transaction using multicall
    const hash = await walletClient.writeContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: nonfungiblePositionManagerAbi,
      functionName: "multicall",
      args: [calls],
      value: value, // Send native MON with the transaction if needed
    });

    console.log(`Position creation tx hash: ${hash}`);

    const receipt = await waitForTransaction(publicClient, hash);

    if (receipt.status === "success") {
      console.log("Successfully minted new Uniswap V3 position!");
      console.log(
        `See transaction details at: https://testnet.monadexplorer.com/tx/${hash}`
      );
      return hash;
    } else {
      console.error("Transaction failed!");
      throw new Error("Failed to mint position");
    }
  } catch (error) {
    console.error("Failed to create position:", error);
    throw error;
  }
}

// Function to collect all fees from a position
async function collectAllFees(
  publicClient: any,
  walletClient: any,
  tokenId: bigint
) {
  console.log(`Collecting fees for position #${tokenId}...`);

  const collectParams = {
    tokenId,
    recipient: walletClient.account.address,
    amount0Max: maxUint256, // Collect all available of token0
    amount1Max: maxUint256, // Collect all available of token1
  };

  const { request } = await publicClient.simulateContract({
    address: POSITION_MANAGER_ADDRESS as `0x${string}`,
    abi: nonfungiblePositionManagerAbi,
    functionName: "collect",
    args: [collectParams],
  });

  const hash = await walletClient.writeContract(request);
  console.log(`Collection transaction hash: ${hash}`);

  const receipt = await waitForTransaction(publicClient, hash);

  if (receipt.status === "success") {
    console.log("Successfully collected fees!");
    console.log(
      `See transaction details at: https://testnet.monadexplorer.com/tx/${hash}`
    );
    return hash;
  } else {
    console.error("Fee collection transaction failed!");
    throw new Error("Failed to collect fees");
  }
}

// Function to increase liquidity for an existing position
async function increaseLiquidity(
  publicClient: any,
  walletClient: any,
  tokenId: bigint,
  token0: `0x${string}`,
  token1: `0x${string}`,
  token0Name: string,
  token1Name: string,
  token0Abi: any,
  token1Abi: any,
  amount0ToAdd: bigint,
  amount1ToAdd: bigint
) {
  console.log(`Increasing liquidity for position #${tokenId}...`);

  // Approve tokens
  await approveToken(
    publicClient,
    walletClient,
    token0,
    token0Name,
    token0Abi,
    POSITION_MANAGER_ADDRESS as `0x${string}`,
    amount0ToAdd
  );
  await approveToken(
    publicClient,
    walletClient,
    token1,
    token1Name,
    token1Abi,
    POSITION_MANAGER_ADDRESS as `0x${string}`,
    amount1ToAdd
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const { request } = await publicClient.simulateContract({
    address: POSITION_MANAGER_ADDRESS as `0x${string}`,
    abi: nonfungiblePositionManagerAbi,
    functionName: "increaseLiquidity",
    args: [
      {
        tokenId,
        amount0Desired: amount0ToAdd,
        amount1Desired: amount1ToAdd,
        amount0Min: 0n, // No slippage protection for simplicity
        amount1Min: 0n, // No slippage protection for simplicity
        deadline,
      },
    ],
  });

  const hash = await walletClient.writeContract(request);
  console.log(`Increase liquidity transaction hash: ${hash}`);

  const receipt = await waitForTransaction(publicClient, hash);

  if (receipt.status === "success") {
    console.log("Successfully increased liquidity!");
    console.log(
      `See transaction details at: https://testnet.monadexplorer.com/tx/${hash}`
    );
    return hash;
  } else {
    console.error("Increase liquidity transaction failed!");
    throw new Error("Failed to increase liquidity");
  }
}

// Function to decrease liquidity for an existing position
async function decreaseLiquidity(
  publicClient: any,
  walletClient: any,
  tokenId: bigint,
  liquidity: bigint
) {
  console.log(`Decreasing liquidity for position #${tokenId}...`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const { request } = await publicClient.simulateContract({
    address: POSITION_MANAGER_ADDRESS as `0x${string}`,
    abi: nonfungiblePositionManagerAbi,
    functionName: "decreaseLiquidity",
    args: [
      {
        tokenId,
        liquidity,
        amount0Min: 0n, // No slippage protection for simplicity
        amount1Min: 0n, // No slippage protection for simplicity
        deadline,
      },
    ],
  });

  const hash = await walletClient.writeContract(request);
  console.log(`Decrease liquidity transaction hash: ${hash}`);

  const receipt = await waitForTransaction(publicClient, hash);

  if (receipt.status === "success") {
    console.log("Successfully decreased liquidity!");
    console.log(
      `See transaction details at: https://testnet.monadexplorer.com/tx/${hash}`
    );

    // Note: After decreasing liquidity, tokens are not automatically sent to your wallet
    // You need to call collect() to claim them
    console.log("Don't forget to call collectAllFees() to claim your tokens");

    return hash;
  } else {
    console.error("Decrease liquidity transaction failed!");
    throw new Error("Failed to decrease liquidity");
  }
}

async function main() {
  console.log("Starting Uniswap V3 operations on Monad Testnet...");

  // Setup account from private key
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  console.log(`Using account: ${account.address}`);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(process.env.ALCHEMY_HTTP_TRANSPORT_URL),
  });

  // Create public client
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(process.env.ALCHEMY_HTTP_TRANSPORT_URL),
  });

  // Check native balance
  console.log("Checking balances...");
  const nativeBalance = await publicClient.getBalance({
    address: account.address,
  });
  console.log(`Native MON balance: ${formatEther(nativeBalance)} MON`);

  try {
    // Check WMON balance
    const wmonContract = {
      address: WMON_ADDRESS as `0x${string}`,
      abi: wmonAbi,
    };

    const wmonBalance = await publicClient.readContract({
      ...wmonContract,
      functionName: "balanceOf",
      args: [account.address],
    });

    console.log(`WMON balance: ${formatEther(wmonBalance as bigint)} WMON`);

    // If WMON balance is low, wrap some native MON
    if ((wmonBalance as bigint) < WMON_DEPOSIT_AMOUNT) {
      console.log("WMON balance too low, wrapping native MON...");

      const { request } = await publicClient.simulateContract({
        ...wmonContract,
        functionName: "deposit",
        value: WMON_DEPOSIT_AMOUNT,
      });

      const hash = await walletClient.writeContract(request);
      console.log(`Wrapped MON to WMON, transaction hash: ${hash}`);

      await waitForTransaction(publicClient, hash);
      console.log("Wrap transaction confirmed");

      // Check updated WMON balance
      const updatedWmonBalance = await publicClient.readContract({
        ...wmonContract,
        functionName: "balanceOf",
        args: [account.address],
      });
      console.log(
        `Updated WMON balance: ${formatEther(
          updatedWmonBalance as bigint
        )} WMON`
      );
    }

    // Check USDT balance (in a real scenario, you would need to acquire USDT through a faucet or other means)
    const usdtContract = {
      address: USDT_ADDRESS as `0x${string}`,
      abi: usdtAbi, // Now using the specific USDT ABI
    };

    // Try to detect USDT decimals
    let usdtDecimals = USDT_DECIMALS;
    try {
      const decimals = await publicClient.readContract({
        ...usdtContract,
        functionName: "decimals",
      });
      usdtDecimals = Number(decimals);
      console.log(`USDT has ${usdtDecimals} decimals`);
    } catch (error) {
      console.warn(
        `Could not detect USDT decimals, using default of ${USDT_DECIMALS}`
      );
    }

    const usdtBalance = await publicClient.readContract({
      ...usdtContract,
      functionName: "balanceOf",
      args: [account.address],
    });

    console.log(
      `USDT balance: ${(usdtBalance as bigint).toString()} (${formatEther(
        (usdtBalance as bigint) * 10n ** BigInt(18 - usdtDecimals)
      )} adjusted)`
    );

    if ((usdtBalance as bigint) < USDT_DEPOSIT_AMOUNT) {
      console.warn(
        "Warning: USDT balance is low. You might need to get USDT from a faucet or other source."
      );
    }

    // Determine token order (token0 must be the lower address)
    let token0: `0x${string}`;
    let token1: `0x${string}`;
    let token0Name: string;
    let token1Name: string;
    let token0Abi: any;
    let token1Abi: any;
    let amount0Desired: bigint;
    let amount1Desired: bigint;

    // Ensure we're using the correct addresses for WMON and USDT
    console.log(`Using WMON address: ${WMON_ADDRESS}`);
    console.log(`Using USDT address: ${USDT_ADDRESS}`);

    // Compare addresses in lowercase to ensure correct ordering
    if (WMON_ADDRESS.toLowerCase() < USDT_ADDRESS.toLowerCase()) {
      token0 = WMON_ADDRESS as `0x${string}`;
      token1 = USDT_ADDRESS as `0x${string}`;
      token0Name = "WMON";
      token1Name = "USDT";
      token0Abi = wmonAbi;
      token1Abi = usdtAbi;
      amount0Desired = WMON_DEPOSIT_AMOUNT;
      amount1Desired = USDT_DEPOSIT_AMOUNT;
      console.log("WMON is token0 (lower address), USDT is token1");
    } else {
      token0 = USDT_ADDRESS as `0x${string}`;
      token1 = WMON_ADDRESS as `0x${string}`;
      token0Name = "USDT";
      token1Name = "WMON";
      token0Abi = usdtAbi;
      token1Abi = wmonAbi;
      amount0Desired = USDT_DEPOSIT_AMOUNT;
      amount1Desired = WMON_DEPOSIT_AMOUNT;
      console.log("USDT is token0 (lower address), WMON is token1");
    }

    console.log(
      `Token order: ${token0Name} (${token0}) is token0, ${token1Name} (${token1}) is token1`
    );
    console.log(`Amount0Desired: ${amount0Desired} ${token0Name}`);
    console.log(`Amount1Desired: ${amount1Desired} ${token1Name}`);

    // Choose operation to perform
    const operation = process.argv[2] || "mint";
    const tokenId = process.argv[3] ? BigInt(process.argv[3]) : 0n;

    switch (operation) {
      case "mint":
        await mintNewPosition(
          publicClient,
          walletClient,
          token0,
          token1,
          token0Name,
          token1Name,
          token0Abi,
          token1Abi,
          amount0Desired,
          amount1Desired
        );
        break;

      case "collect":
        if (tokenId === 0n) {
          console.error("Error: tokenId is required for collect operation");
          console.log("Usage: npm run open-position collect <tokenId>");
          process.exit(1);
        }
        await collectAllFees(publicClient, walletClient, tokenId);
        break;

      case "increase":
        if (tokenId === 0n) {
          console.error("Error: tokenId is required for increase operation");
          console.log("Usage: npm run open-position increase <tokenId>");
          process.exit(1);
        }
        // Using smaller amounts for increasing liquidity
        await increaseLiquidity(
          publicClient,
          walletClient,
          tokenId,
          token0,
          token1,
          token0Name,
          token1Name,
          token0Abi,
          token1Abi,
          amount0Desired / 2n,
          amount1Desired / 2n
        );
        break;

      case "decrease":
        if (tokenId === 0n) {
          console.error("Error: tokenId is required for decrease operation");
          console.log(
            "Usage: npm run open-position decrease <tokenId> <liquidity>"
          );
          process.exit(1);
        }
        const liquidity = process.argv[4] ? BigInt(process.argv[4]) : 0n;
        if (liquidity === 0n) {
          console.error(
            "Error: liquidity amount is required for decrease operation"
          );
          console.log(
            "Usage: npm run open-position decrease <tokenId> <liquidity>"
          );
          process.exit(1);
        }
        await decreaseLiquidity(publicClient, walletClient, tokenId, liquidity);
        break;

      default:
        console.error(`Unknown operation: ${operation}`);
        console.log("Available operations: mint, collect, increase, decrease");
        console.log(
          "Usage: npm run open-position <operation> [tokenId] [liquidity]"
        );
    }
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
