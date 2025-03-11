import axios from "axios";
import { monadTestnet } from "viem/chains";

/**
 * Interface for position response from Uniswap API
 */
interface PositionResponse {
  addresses: string[];
  pageToken: string;
  positions: Position[];
}

/**
 * Interface representing a position
 */
interface Position {
  id: string;
  chainId: number;
  owner: string;
  positionStatus: string;
  protocol: string;
  token0: {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  token1: {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  fee: number;
  createdAtTimestamp: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  collectableToken0: string;
  collectableToken1: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
}

/**
 * Fetches all positions for a given wallet address from Uniswap
 * @param walletAddress - The wallet address to fetch positions for
 * @returns Array of positions
 */
export async function fetchPositions(
  walletAddress: string
): Promise<Position[]> {
  try {
    const url =
      "https://interface.gateway.uniswap.org/v2/pools.v1.PoolsService/ListPositions";

    const headers = {
      accept: "*/*",
      "accept-language": "en-GB,en;q=0.7",
      "cache-control": "no-cache",
      "connect-protocol-version": "1",
      "content-type": "application/json",
      origin: "https://app.uniswap.org",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: "https://app.uniswap.org/",
      "sec-ch-ua": '"Brave";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "sec-gpc": "1",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };

    const body = {
      address: walletAddress,
      chainIds: [monadTestnet.id], // Sepolia, Monad, etc.
      protocolVersions: ["PROTOCOL_VERSION_V3"],
      positionStatuses: [
        "POSITION_STATUS_IN_RANGE",
        "POSITION_STATUS_OUT_OF_RANGE",
      ],
      pageSize: 25,
      pageToken: "",
      includeHidden: true,
    };

    const response = await axios.post<PositionResponse>(url, body, { headers });

    console.log("Response:", response);

    if (!response.data || !response.data.positions) {
      console.log("No positions found or invalid response format");
      return [];
    }

    return response.data.positions;
  } catch (error) {
    console.error("Error fetching positions:", error);
    throw new Error(
      `Failed to fetch positions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Formats position details into a readable string
 * @param position - The position to format
 * @returns A formatted string with position details
 */
export function formatPositionDetails(position: Position): string {
  return `
🔹 *Position ID:* ${position.id}
🔹 *Chain:* ${getChainName(position.chainId)}
🔹 *Status:* ${formatStatus(position.positionStatus)}
🔹 *Protocol:* ${position.protocol.replace("PROTOCOL_VERSION_", "")}
🔹 *Pair:* ${position.token0.symbol}/${position.token1.symbol}
🔹 *Fee:* ${position.fee / 10000}%
🔹 *Liquidity:* ${BigInt(position.liquidity) > 0n ? "✅ Active" : "❌ Inactive"}
🔹 *Deposited:* 
   • ${formatAmount(position.depositedToken0, position.token0.decimals)} ${
    position.token0.symbol
  }
   • ${formatAmount(position.depositedToken1, position.token1.decimals)} ${
    position.token1.symbol
  }
🔹 *Collectible Fees:*
   • ${formatAmount(position.collectableToken0, position.token0.decimals)} ${
    position.token0.symbol
  }
   • ${formatAmount(position.collectableToken1, position.token1.decimals)} ${
    position.token1.symbol
  }
🔹 *Created:* ${new Date(
    parseInt(position.createdAtTimestamp) * 1000
  ).toLocaleString()}
`;
}

/**
 * Helper function to format position status
 */
function formatStatus(status: string): string {
  switch (status) {
    case "POSITION_STATUS_IN_RANGE":
      return "🟢 In Range";
    case "POSITION_STATUS_OUT_OF_RANGE":
      return "🔴 Out of Range";
    default:
      return status.replace("POSITION_STATUS_", "");
  }
}

/**
 * Helper function to get chain name from chain ID
 */
function getChainName(chainId: number): string {
  switch (chainId) {
    case 1:
      return "Ethereum";
    case 10143:
      return "Monad";
    case 11155111:
      return "Sepolia";
    case 1301:
      return "Monad Testnet";
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Helper function to format token amounts
 */
function formatAmount(amount: string, decimals: number): string {
  if (!amount || amount === "0") return "0";

  const value = BigInt(amount);
  const divisor = BigInt(10) ** BigInt(decimals);

  // Calculate the whole and fractional parts
  const wholePart = value / divisor;
  const fractionalPart = value % divisor;

  // Format the fractional part to have the correct number of leading zeros
  let fractionalStr = fractionalPart.toString().padStart(decimals, "0");

  // Trim trailing zeros
  fractionalStr = fractionalStr.replace(/0+$/, "");

  // If no fractional part remains after trimming, return just the whole part
  if (fractionalStr === "") {
    return wholePart.toString();
  }

  return `${wholePart}.${fractionalStr}`;
}
