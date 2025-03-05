import fetch from "node-fetch";
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
  initialDependentAmount: string;
  initialPrice: string;
  position: Position;
}

interface ApiResponse {
  to: string;
  value: string;
  data: string;
}

// Replace with your private key
const PRIVATE_KEY =
  "0x8ec7dc58cee740793da6955abdb65dca8a46a88b98e68dd30622ad861928fdaf";

async function createAndExecuteLPPosition() {
  const url =
    "https://trading-api-labs.interface.gateway.uniswap.org/v1/lp/create";

  const headers = {
    "content-type": "application/json",
    "x-api-key": "JoyCGj29tT4pymvhaGciK4r1aIPvqW6W53xT1fwo",
    "x-request-source": "uniswap-web",
  };

  const body: RequestBody = {
    simulateTransaction: false,
    protocol: "V4",
    walletAddress: "0xAEBE6d36f132068408889252B48537b21FEA7683",
    chainId: 10143,
    independentAmount: "100000000000000000",
    independentToken: "TOKEN_1",
    initialDependentAmount: "0",
    initialPrice: "79228162514264337593543950336",
    position: {
      tickLower: -23040,
      tickUpper: 0,
      pool: {
        tickSpacing: 60,
        token0: "0x0000000000000000000000000000000000000000",
        token1: "0xb2f82d0f38dc453d596ad40a37799446cc89274a",
        fee: 3000,
      },
    },
  };

  try {
    // Make API call
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const apiData = (await response.json()) as ApiResponse;
    console.log("API Response:", JSON.stringify(apiData, null, 2));

    // Create account from private key
    const account = privateKeyToAccount(PRIVATE_KEY);

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

createAndExecuteLPPosition();
