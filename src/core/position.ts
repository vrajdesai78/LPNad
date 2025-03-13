import axios from "axios";
import { parseEther, publicActions } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { getOrCreateWallet } from "./wallet";

interface Position {
  tickLower: number;
  tickUpper: number;
  pool: {
    tickSpacing: number;
    token0: string;
    token1: string;
    fee: number;
  };
}

interface RequestBody {
  simulateTransaction: boolean;
  protocol: string;
  walletAddress: string;
  chainId: number;
  independentAmount: string;
  independentToken: string;
  position: Position;
}

interface ApiResponse {
  to: string;
  value: string;
  data: string;
}

export async function createAndExecuteLPPosition(
  userId: number,
  tokenAddress: string
) {
  const { client: walletClient } = await getOrCreateWallet(userId);

  const client = walletClient.extend(publicActions);

  const [walletAddress] = await walletClient.getAddresses();

  const url =
    "https://trading-api-labs.interface.gateway.uniswap.org/v1/lp/create";

  const headers = {
    accept: "*/*",
    "accept-language": "en-GB,en;q=0.7",
    "cache-control": "no-cache",
    "content-type": "application/json",
    pragma: "no-cache",
    priority: "u=1, i",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "x-api-key": process.env.UNISWAP_API_KEY!,
    "x-app-version": "",
    "x-request-source": "uniswap-web",
  };

  const body: RequestBody = {
    simulateTransaction: false,
    protocol: "V3",
    walletAddress: walletAddress,
    chainId: 10143,
    independentAmount: "10000",
    independentToken: "TOKEN_1",
    position: {
      tickLower: -887272,
      tickUpper: 887272,
      pool: {
        tickSpacing: 1,
        token0: "0x0000000000000000000000000000000000000000",
        token1: tokenAddress,
        fee: 100,
      },
    },
  };

  try {
    // Make API call
    const response = await axios.post(url, body, { headers });

    if (!response.data) {
      throw new Error(`API response is empty`);
    }

    const apiData = response.data as ApiResponse;
    console.log("API Response:", JSON.stringify(apiData, null, 2));

    // Use the API response data for the transaction
    const txData = {
      to: apiData.to as `0x${string}`,
      value: parseEther(apiData.value || "0.000000000000000001"),
      data: apiData.data as `0x${string}`,
    };

    // Send transaction
    const hash = await client.sendTransaction(txData as any);
    console.log("Transaction hash:", hash);

    // Wait for transaction receipt
    const receipt = await waitForTransactionReceipt(client, { hash });
    console.log("Transaction receipt:", receipt);

    // Create explorer URL
    const explorerUrl = `https://testnet.monadexplorer.com/tx/${hash}`;
    console.log(`See transaction details at: ${explorerUrl}`);

    // Return the result with transaction hash and explorer URL
    return {
      success: true,
      hash,
      explorerUrl,
    };
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}
