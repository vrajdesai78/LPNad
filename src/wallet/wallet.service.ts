import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";
import * as CryptoJS from "crypto-js";
import redis from "../services/redis";

// Encryption key from environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

/**
 * Encrypt a private key using AES encryption
 * @param privateKey - The private key to encrypt
 * @returns Encrypted private key string
 */
export const encryptPrivateKey = (privateKey: string): string => {
  return CryptoJS.AES.encrypt(privateKey, ENCRYPTION_KEY).toString();
};

/**
 * Decrypt an encrypted private key
 * @param encryptedPrivateKey - The encrypted private key
 * @returns Decrypted private key string
 */
export const decryptPrivateKey = (encryptedPrivateKey: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedPrivateKey, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

/**
 * Generate a new wallet for a user
 * @param userId - Telegram user ID
 * @returns Wallet address and private key
 */
export const generateWallet = async (userId: number) => {
  // Generate a new private key
  const privateKey = generatePrivateKey();

  // Create an account from the private key
  const account = privateKeyToAccount(privateKey);

  // Encrypt the private key
  const encryptedPrivateKey = encryptPrivateKey(privateKey);

  // Store the encrypted private key in Redis
  await redis.set(`wallet:${userId}`, encryptedPrivateKey);

  return {
    address: account.address,
    privateKey,
  };
};

/**
 * Get a user's wallet from Redis
 * @param userId - Telegram user ID
 * @returns Wallet address and private key, or null if not found
 */
export const getWallet = async (userId: number) => {
  // Get the encrypted private key from Redis
  const encryptedPrivateKey = await redis.get<string>(`wallet:${userId}`);

  if (!encryptedPrivateKey) {
    return null;
  }

  // Decrypt the private key
  const privateKey = decryptPrivateKey(encryptedPrivateKey);

  // Create an account from the private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return {
    address: account.address,
    privateKey,
  };
};

/**
 * Check if a user has a wallet
 * @param userId - Telegram user ID
 * @returns Boolean indicating if the user has a wallet
 */
export const hasWallet = async (userId: number): Promise<boolean> => {
  const wallet = await redis.get<string>(`wallet:${userId}`);
  return !!wallet;
};

/**
 * Get the balance of a wallet
 * @param address - Wallet address
 * @returns Balance in ETH
 */
export const getWalletBalance = async (address: string): Promise<string> => {
  // Create a public client
  const client = createPublicClient({
    chain: mainnet,
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

  // Format the balance to ETH
  return formatEther(balance);
};

/**
 * Get or create a wallet for a user
 * @param userId - Telegram user ID
 * @returns Wallet address and private key
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
