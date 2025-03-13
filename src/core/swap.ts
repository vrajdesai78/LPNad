import { config as dotenv } from "dotenv";
import {
  getContract,
  erc20Abi,
  parseUnits,
  maxUint256,
  publicActions,
  concat,
  numberToHex,
  size,
} from "viem";
import type { Hex } from "viem";
import axios from "axios";
import { getOrCreateWallet } from "./wallet";

// load env vars
dotenv();
const { ZERO_EX_API_KEY, ALCHEMY_HTTP_TRANSPORT_URL } = process.env;

// validate requirements
if (!ZERO_EX_API_KEY) throw new Error("missing ZERO_EX_API_KEY.");
if (!ALCHEMY_HTTP_TRANSPORT_URL)
  throw new Error("missing ALCHEMY_HTTP_TRANSPORT_URL.");

// Convert Headers to a plain object for axios
const axiosHeaders = {
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
};

// Contract addresses for Base network
const CONTRACTS = {
  MON: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDC: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
  USDT: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
  MOLANDAK: "0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714",
  CHOG: "0xE0590015A873bF326bd645c3E1266d4db41C4E6B",
} as const;

// set up contracts

export type TokenType =
  | "MON"
  | "USDC"
  | "USDT"
  | "MOLANDAK"
  | "CHOG"
  | "CUSTOM";
type TokenAddress = string;

// Store user's custom token addresses
const userCustomTokens: Record<number, TokenAddress> = {};

export const executeSwap = async (
  sellTokenType: TokenType,
  amount: string,
  userId: number,
  buyTokenType: TokenType = "USDC",
  customTokenAddress?: string
) => {
  try {
    const { client: walletClient } = await getOrCreateWallet(userId);

    if (!walletClient) {
      throw new Error("Failed to create wallet client");
    }

    const client = walletClient.extend(publicActions);

    let address: string;

    [address] = await client.getAddresses();

    const eth = getContract({
      address: CONTRACTS.MON,
      abi: erc20Abi,
      client,
    });

    const sellToken = eth;
    let sellAmount;

    // Determine buy token address
    let buyTokenAddress: TokenAddress = CONTRACTS.USDC as TokenAddress; // Default

    if (buyTokenType === "CUSTOM" && customTokenAddress) {
      buyTokenAddress = customTokenAddress;
      // Store the custom address for this user
      userCustomTokens[userId] = customTokenAddress;
    } else if (buyTokenType !== "CUSTOM" && buyTokenType in CONTRACTS) {
      buyTokenAddress = CONTRACTS[
        buyTokenType as keyof typeof CONTRACTS
      ] as TokenAddress;
    }

    // handle ETH separately (no need to call decimals on ETH)
    if (sellToken.address === CONTRACTS.MON) {
      sellAmount = parseUnits(amount, 18); // ETH has 18 decimals
    } else {
      // specify sell amount for ERC-20 tokens
      sellAmount = parseUnits(amount, await sellToken.read.decimals());
    }

    // 1. fetch price
    const priceParams = new URLSearchParams({
      chainId: client.chain?.id.toString() ?? "",
      sellToken: sellToken.address,
      buyToken: buyTokenAddress,
      sellAmount: sellAmount.toString(),
      taker: client.account?.address ?? "",
    });

    const priceResponse = await axios.get(
      "https://api.0x.org/swap/permit2/price?" + priceParams.toString(),
      { headers: axiosHeaders }
    );

    if (!priceResponse.data) {
      throw new Error("Failed to get price");
    }

    const price = await priceResponse.data;
    console.log(`Fetching price to swap 0.0001 ${sellTokenType} for USDC`);
    console.log(
      `https://api.0x.org/swap/permit2/price?${priceParams.toString()}`
    );
    console.log("priceResponse: ", price);

    // 2. Check if the sellToken is a native token (ETH) to skip allowance
    if (sellToken.address === CONTRACTS.MON) {
      console.log("Native token detected, no need for allowance check");
    } else {
      // Check if allowance is required
      if (price.issues.allowance !== null) {
        try {
          // Simulate the approve transaction first
          const { request } = await client.simulateContract({
            address: sellToken.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [price.issues.allowance.spender, maxUint256],
            account: client.account,
          });

          console.log("Approving Permit2 to spend sellToken...");

          // Execute the approve transaction
          const hash = await client.writeContract(request);

          console.log(
            "Approved Permit2 to spend sellToken.",
            await client.waitForTransactionReceipt({ hash })
          );
        } catch (error) {
          console.log("Error approving Permit2:", error);
        }
      } else {
        console.log("sellToken already approved for Permit2");
      }
    }

    // 3. fetch quote
    const quoteParams = new URLSearchParams();
    for (const [key, value] of priceParams.entries()) {
      quoteParams.append(key, value);
    }

    const quoteResponse = await axios.get(
      "https://api.0x.org/swap/permit2/quote?" + quoteParams.toString(),
      { headers: axiosHeaders }
    );

    if (!quoteResponse.data) {
      throw new Error("Failed to get quote");
    }

    const quote = quoteResponse.data;
    console.log(`Fetching quote to swap 0.0001 ${sellTokenType} for USDC`);
    console.log("quoteResponse: ", quote);

    // 4. sign permit2.eip712 returned from quote
    let signature: Hex | undefined;
    if (quote.permit2?.eip712) {
      try {
        signature = await client.signTypedData(quote.permit2.eip712);
        console.log("Signed permit2 message from quote response");
      } catch (error) {
        console.error("Error signing permit2 coupon:", error);
      }

      // 5. append sig length and sig data to transaction.data
      if (signature && quote?.transaction?.data) {
        const signatureLengthInHex = numberToHex(size(signature), {
          signed: false,
          size: 32,
        });

        const transactionData = quote.transaction.data as Hex;
        const sigLengthHex = signatureLengthInHex as Hex;
        const sig = signature as Hex;

        quote.transaction.data = concat([transactionData, sigLengthHex, sig]);
      } else {
        throw new Error("Failed to obtain signature or transaction data");
      }
    }

    // 6. submit txn with permit2 signature
    if (!client.account) {
      throw new Error("Account is not defined");
    }

    const nonce = await client.getTransactionCount({
      address: client.account.address,
    });

    // Improve gas estimation
    const gasEstimate = await client.estimateGas({
      account: client.account,
      to: quote?.transaction.to,
      data: quote.transaction.data,
      value:
        sellToken.address === CONTRACTS.MON
          ? BigInt(quote.transaction.value)
          : BigInt(0),
    });

    const commonTxParams = {
      account: client.account,
      chain: client.chain,
      to: quote?.transaction.to as `0x${string}`,
      data: quote.transaction.data as `0x${string}`,
      gas: gasEstimate,
      nonce: nonce,
      gasPrice: quote?.transaction.gasPrice
        ? BigInt(quote.transaction.gasPrice)
        : await client.getGasPrice(),
    };

    // Check if it's a native token (like ETH)
    if (sellToken.address === CONTRACTS.MON) {
      const transaction = await client.sendTransaction({
        ...commonTxParams,
        value: BigInt(quote.transaction.value),
      });

      const receipt = await client.waitForTransactionReceipt({
        hash: transaction,
      });
      console.log("Transaction hash:", transaction);
      console.log("Transaction status:", receipt.status);
      const explorerUrl = `https://testnet.monadexplorer.com/tx/${transaction}`;
      console.log(`See tx details at ${explorerUrl}`);

      // Return transaction details
      return {
        success: true,
        hash: transaction,
        explorerUrl,
      };
    } else if (signature && quote.transaction.data) {
      const signedTransaction = await client.signTransaction({
        ...commonTxParams,
        value: BigInt(0),
      });

      const hash = await client.sendRawTransaction({
        serializedTransaction: signedTransaction,
      });

      const receipt = await client.waitForTransactionReceipt({ hash });
      console.log("Transaction hash:", hash);
      console.log("Transaction status:", receipt.status);
      const explorerUrl = `https://testnet.monadexplorer.com/tx/${hash}`;
      console.log(`See tx details at ${explorerUrl}`);

      // Return transaction details
      return {
        success: true,
        hash,
        explorerUrl,
      };
    } else {
      throw new Error("Failed to obtain a signature, transaction not sent.");
    }
  } catch (error) {
    console.error(`Error executing ${sellTokenType} swap:`, error);
    throw error; // Re-throw to be handled by the main function
  }
};
