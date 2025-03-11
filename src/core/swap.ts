import { config as dotenv } from "dotenv";
import {
  createWalletClient,
  http,
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
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import axios from "axios";

// load env vars
dotenv();
const { PRIVATE_KEY, ZERO_EX_API_KEY, ALCHEMY_HTTP_TRANSPORT_URL } =
  process.env;

// validate requirements
if (!PRIVATE_KEY) throw new Error("missing PRIVATE_KEY.");
if (!ZERO_EX_API_KEY) throw new Error("missing ZERO_EX_API_KEY.");
if (!ALCHEMY_HTTP_TRANSPORT_URL)
  throw new Error("missing ALCHEMY_HTTP_TRANSPORT_URL.");

// fetch headers
const headers = new Headers({
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
});

// Convert Headers to a plain object for axios
const axiosHeaders = {
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
};

// setup wallet client
const client = createWalletClient({
  account: privateKeyToAccount(`0x${PRIVATE_KEY}` as `0x${string}`),
  chain: monadTestnet,
  transport: http(ALCHEMY_HTTP_TRANSPORT_URL),
}).extend(publicActions);

let address: string;

const initialize = async () => {
  [address] = await client.getAddresses();
  console.log("address: ", address);
};

// Contract addresses for Base network
const CONTRACTS = {
  MON: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDC: "0xf817257fed379853cde0fa4f97ab987181b1e5ea",
} as const;

// set up contracts
const eth = getContract({
  address: CONTRACTS.MON,
  abi: erc20Abi,
  client,
});

type TokenType = "MON";

export const executeSwap = async (sellTokenType: TokenType, amount: string) => {
  try {
    // Initialize client and address first
    await initialize();

    const sellToken = eth;
    let sellAmount;

    // handle ETH separately (no need to call decimals on ETH)
    if (sellToken.address === CONTRACTS.MON) {
      sellAmount = parseUnits(amount, 18); // ETH has 18 decimals
    } else {
      // specify sell amount for ERC-20 tokens
      sellAmount = parseUnits(amount, await sellToken.read.decimals());
    }

    // 1. fetch price
    const priceParams = new URLSearchParams({
      chainId: client.chain.id.toString(),
      sellToken: sellToken.address,
      buyToken: CONTRACTS.USDC,
      sellAmount: sellAmount.toString(),
      taker: client.account.address,
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
          const { request } = await sellToken.simulate.approve([
            price.issues.allowance.spender,
            maxUint256,
          ]);
          console.log("Approving Permit2 to spend sellToken...", request);
          // set approval
          const hash = await sellToken.write.approve(request.args);
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
      console.log(
        `See tx details at https://testnet.monadexplorer.com/tx/${transaction}`
      );
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
      console.log(
        `See tx details at https://testnet.monadexplorer.com/tx/${hash}`
      );
    } else {
      throw new Error("Failed to obtain a signature, transaction not sent.");
    }
  } catch (error) {
    console.error(`Error executing ${sellTokenType} swap:`, error);
    throw error; // Re-throw to be handled by the main function
  }
};

const main = async () => {
  try {
    await initialize();
    // Execute ETH to USDC swap
    console.log("Executing ETH to USDC swap...");
    await executeSwap("MON", "0.001");

    // Wait a few blocks before executing the next transaction
    console.log("Waiting before executing next swap...");
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15 seconds

    // // Execute WETH to USDC swap
    // console.log("\nExecuting WETH to USDC swap...");
    // await executeSwap("MON");
  } catch (error) {
    console.error("Error executing swaps:", error);
  }
};

// Export the main function for direct usage if needed
export const runSwap = main;
