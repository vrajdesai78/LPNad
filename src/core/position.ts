import axios from "axios";
import { createWalletClient, http, parseEther } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

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

export async function createAndExecuteLPPosition(walletAddress: string) {
  const url =
    "https://trading-api-labs.interface.gateway.uniswap.org/v1/lp/create";

  const headers = {
    "content-type": "application/json",
    "x-api-key": process.env.API_KEY!,
    "x-request-source": "uniswap-web",
  };

  const body: RequestBody = {
    simulateTransaction: false,
    protocol: "V3",
    walletAddress: walletAddress,
    chainId: 10143,
    independentAmount: "6146",
    independentToken: "TOKEN_1",
    position: {
      tickLower: -887270,
      tickUpper: 887270,
      pool: {
        tickSpacing: 60,
        token0: "0x0000000000000000000000000000000000000000",
        token1: "0xf817257fed379853cde0fa4f97ab987181b1e5ea",
        fee: 500,
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

    // Create account from private key
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY! as `0x${string}`
    );

    // Create wallet client
    const client = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(),
    });

    // Use the API response data for the transaction
    const txData = {
      to: apiData.to as `0x${string}`,
      value: parseEther(apiData.value || "0.000000000000000001"),
      data: apiData.data as `0x${string}`,
    };

    // Send transaction
    const hash = await client.sendTransaction(txData);
    console.log("Transaction hash:", hash);

    // Wait for transaction receipt
    const receipt = await waitForTransactionReceipt(client, { hash });
    console.log("Transaction receipt:", receipt);
  } catch (error) {
    console.error("Error:", error);
  }
}
