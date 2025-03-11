import {
  createPublicClient,
  http,
  formatEther,
  createWalletClient,
} from "viem";
import { base } from "viem/chains";
import * as CryptoJS from "crypto-js";
import redis from "../services/redis";
import { PrivyClient } from "@privy-io/server-auth";
// @ts-ignore
import { createViemAccount } from "@privy-io/server-auth/viem";

// Encryption key from environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!ENCRYPTION_KEY || !PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  throw new Error("Missing environment variables");
}

// Privy client
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

/**
 * Encrypt a wallet ID using AES encryption
 * @param walletId - The wallet ID to encrypt
 * @returns Encrypted wallet ID string
 */
export const encryptWalletId = (walletId: string): string => {
  return CryptoJS.AES.encrypt(walletId, ENCRYPTION_KEY).toString();
};

/**
 * Decrypt an encrypted wallet ID
 * @param encryptedWalletId - The encrypted wallet ID
 * @returns Decrypted wallet ID string
 */
export const decryptWalletId = (encryptedWalletId: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedWalletId, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

/**
 * Generate a new wallet for a user
 * @param userId - Telegram user ID
 * @returns Wallet address and private key
 */
export const generateWallet = async (userId: number) => {
  // Generate a new wallet
  const { id, address } = await privy.walletApi.create({
    chainType: "ethereum",
  });

  // Encrypt the wallet ID
  const encryptedWalletId = encryptWalletId(id);

  // Store the encrypted wallet ID in Redis
  await redis.set(`wallet:${userId}`, encryptedWalletId);
  await redis.set(`wallet:${userId}:address`, address);

  const account = await createViemAccount({
    walletId: id,
    address: address as `0x${string}`,
    privy,
  });

  const client = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  return {
    client,
    address,
  };
};

/**
 * Get a user's wallet from Redis
 * @param userId - Telegram user ID
 * @returns Wallet address and viem client, or null if not found
 */
export const getWallet = async (userId: number) => {
  // Get the encrypted wallet ID from Redis
  const encryptedWalletId = await redis.get<string>(`wallet:${userId}`);
  const address = await redis.get<string>(`wallet:${userId}:address`);

  if (!encryptedWalletId || !address) {
    return null;
  }

  // Decrypt the wallet ID
  const walletId = decryptWalletId(encryptedWalletId);

  // Create an account from the wallet ID
  const account = await createViemAccount({
    walletId: walletId,
    address: address as `0x${string}`,
    privy,
  });

  const client = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  return {
    client,
    address,
  };
};

/**
 * Get the balance of a wallet
 * @param address - Wallet address
 * @returns Balance in MON
 */
export const getWalletBalance = async (address: string): Promise<string> => {
  // Create a public client
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });

  // Ensure address is properly formatted as 0x-prefixed string
  const formattedAddress = address.startsWith("0x")
    ? (address as `0x${string}`)
    : (`0x${address}` as `0x${string}`);

  // Get the balance
  const balance = await client.getBalance({
    address: formattedAddress,
  });

  // Format the balance to MON
  return formatEther(balance);
};

/**
 * Get or create a wallet for a user
 * @param userId - Telegram user ID
 * @returns Wallet address and viem client
 */
export const getOrCreateWallet = async (userId: number) => {
  // Check if the user already has a wallet
  const existingWallet = await getWallet(userId);

  if (existingWallet) {
    return existingWallet;
  }

  // Create a new wallet if one doesn't exist
  return generateWallet(userId);
};
