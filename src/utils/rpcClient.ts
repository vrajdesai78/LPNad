import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  Chain,
  Account,
  Transport,
  custom,
} from "viem";
import { monadTestnet } from "viem/chains";
import { config } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

config();

// RPC URLs from environment variables
const RPC_URLS = [
  process.env.ALCHEMY_HTTP_TRANSPORT_URL,
  process.env.BLOCKVISION_RPC_URL,
  process.env.PUBLIC_RPC_URL,
].filter(Boolean) as string[];

// Validate that we have at least one RPC URL
if (RPC_URLS.length === 0) {
  throw new Error("No RPC URLs found in environment variables");
}

// Default timeout for RPC requests in milliseconds
const DEFAULT_TIMEOUT = 10000;

// Track the current RPC index
let currentRpcIndex = 0;

/**
 * Creates a custom transport with retry logic across multiple RPC URLs
 * @param timeout - Timeout in milliseconds for each RPC request
 * @returns Custom transport with retry logic
 */
export function createRetryTransport(
  timeout: number = DEFAULT_TIMEOUT
): Transport {
  return custom({
    async request({ method, params }) {
      // Try each RPC URL in sequence until one succeeds
      let lastError;

      // Try each RPC URL
      for (let attempt = 0; attempt < RPC_URLS.length; attempt++) {
        const rpcUrl = RPC_URLS[(currentRpcIndex + attempt) % RPC_URLS.length];

        try {
          // Create a fetch request directly instead of using transport.request
          const response = await fetch(rpcUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method,
              params,
            }),
            signal: AbortSignal.timeout(timeout),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(data.error.message || "RPC error");
          }

          // If successful, update the current index to this working RPC
          currentRpcIndex = (currentRpcIndex + attempt) % RPC_URLS.length;
          return data.result;
        } catch (error) {
          console.warn(
            `RPC request failed for ${rpcUrl}: ${(error as Error).message}`
          );
          lastError = error;
          // Continue to the next RPC URL
        }
      }

      // If we've tried all RPCs and none worked, throw the last error
      throw lastError || new Error("All RPC endpoints failed");
    },
  });
}

/**
 * Creates a public client with retry logic across multiple RPC URLs
 * @param chain - The blockchain chain to connect to
 * @param timeout - Timeout in milliseconds for each RPC request
 * @returns Public client with retry logic
 */
export function createReliablePublicClient(
  chain: Chain = monadTestnet,
  timeout: number = DEFAULT_TIMEOUT
): PublicClient {
  return createPublicClient({
    chain,
    transport: createRetryTransport(timeout),
  });
}

/**
 * Creates a wallet client with retry logic across multiple RPC URLs
 * @param account - The account to use for transactions
 * @param chain - The blockchain chain to connect to
 * @param timeout - Timeout in milliseconds for each RPC request
 * @returns Wallet client with retry logic
 */
export function createReliableWalletClient(
  account: Account,
  chain: Chain = monadTestnet,
  timeout: number = DEFAULT_TIMEOUT
): WalletClient {
  return createWalletClient({
    account,
    chain,
    transport: createRetryTransport(timeout),
  });
}

/**
 * Creates a wallet client from a private key with retry logic
 * @param privateKey - The private key to use (defaults to PRIVATE_KEY env var)
 * @param chain - The blockchain chain to connect to
 * @param timeout - Timeout in milliseconds for each RPC request
 * @returns Wallet client with retry logic
 */
export function createReliableWalletClientFromPrivateKey(
  privateKey: string = process.env.PRIVATE_KEY as string,
  chain: Chain = monadTestnet,
  timeout: number = DEFAULT_TIMEOUT
): WalletClient {
  if (!privateKey) {
    throw new Error(
      "Private key not provided and PRIVATE_KEY not found in environment variables"
    );
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createReliableWalletClient(account, chain, timeout);
}

/**
 * Utility function to get the current RPC URL being used
 * @returns The current RPC URL
 */
export function getCurrentRpcUrl(): string {
  return RPC_URLS[currentRpcIndex];
}

/**
 * Utility function to get all available RPC URLs
 * @returns Array of all RPC URLs
 */
export function getAllRpcUrls(): string[] {
  return [...RPC_URLS];
}
