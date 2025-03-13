import * as WebSocket from "ws";
import { createPublicClient, http, formatEther } from "viem";
import { avalancheFuji } from "viem/chains";
import { bridgeNatively } from "../utils/wormhole";
import { getWallet } from "../core/wallet";
import redis from "../services/redis";
import { privateKeyToAccount } from "viem/accounts";

interface BalanceMonitorConfig {
  userId: number;
  address: string;
  privateKey: string;
  minIncrease?: string; // Minimum increase in AVAX to trigger bridging
  bridgeAmount?: string; // Amount to bridge when triggered (or percentage if ends with %)
}

/**
 * Class to monitor Avalanche Fuji C-Chain balance changes via WebSocket
 */
export class AvalancheBalanceMonitor {
  private ws: WebSocket | null = null;
  private address: string;
  private userId: number;
  private privateKey: string;
  private subscriptionId: string | null = null;
  private lastBalance: string = "0";
  private minIncrease: string;
  private bridgeAmount: string;
  private wsUrl: string = "wss://avalanche-fuji-c-chain-rpc.publicnode.com";
  private reconnectAttempts: number = 0;
  private reconnectInterval: number = 5000; // 5 seconds
  private maxReconnectAttempts: number = 10;
  private publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(),
  });

  constructor(config: BalanceMonitorConfig) {
    this.address = config.address;
    this.userId = config.userId;
    this.privateKey = config.privateKey;
    this.minIncrease = config.minIncrease || "0.01"; // Default to 0.01 AVAX
    this.bridgeAmount = config.bridgeAmount || "100%"; // Default to bridge all new funds
  }

  /**
   * Start monitoring balance changes
   */
  public async start(): Promise<void> {
    try {
      // Get initial balance
      this.lastBalance = await this.getAvalancheBalance();
      console.log(
        `Initial balance for ${this.address}: ${this.lastBalance} AVAX`
      );

      // Connect to WebSocket
      this.connect();
    } catch (error) {
      console.error(`Error starting balance monitor: ${error}`);
      throw error;
    }
  }

  /**
   * Connect to the Avalanche WebSocket
   */
  private connect(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on("open", () => {
      console.log(`WebSocket connected to ${this.wsUrl}`);
      this.subscribeToBalance();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on("error", (error: Error) => {
      console.error(`WebSocket error: ${error}`);
    });

    this.ws.on("close", () => {
      console.warn("WebSocket connection closed");
      this.subscriptionId = null;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(
          `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
        );
        setTimeout(() => this.connect(), this.reconnectInterval);
      } else {
        console.error("Maximum reconnect attempts reached");
      }
    });
  }

  /**
   * Subscribe to balance changes
   */
  private subscribeToBalance(): void {
    if (!this.ws) return;

    // Create a subscription to new blocks
    const subscribeMsg = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_subscribe",
      params: ["newHeads"],
    };

    this.ws.send(JSON.stringify(subscribeMsg));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      // Handle subscription confirmation
      if (message.id === 1 && message.result) {
        this.subscriptionId = message.result;
        console.log(`Subscription confirmed: ${this.subscriptionId}`);
        return;
      }

      // Handle subscription events
      if (
        message.method === "eth_subscription" &&
        message.params?.subscription === this.subscriptionId
      ) {
        // New block received, check balance
        await this.checkBalance();
      }
    } catch (error) {
      console.error(`Error handling WebSocket message: ${error}`);
    }
  }

  /**
   * Check Avalanche balance and trigger bridge if it has increased
   */
  private async checkBalance(): Promise<void> {
    try {
      const currentBalance = await this.getAvalancheBalance();
      const lastBalanceNum = parseFloat(this.lastBalance);
      const currentBalanceNum = parseFloat(currentBalance);

      // Calculate difference
      const difference = currentBalanceNum - lastBalanceNum;

      // If balance increased more than the minimum threshold
      if (difference > parseFloat(this.minIncrease)) {
        console.log(
          `Balance increased by ${difference} AVAX (${this.lastBalance} → ${currentBalance})`
        );

        // Determine how much to bridge
        let amountToBridge: string;

        if (this.bridgeAmount.endsWith("%")) {
          // Bridge a percentage of the increase
          const percentage = parseFloat(this.bridgeAmount.slice(0, -1)) / 100;
          amountToBridge = (difference * percentage).toFixed(18);
        } else {
          // Bridge a fixed amount
          amountToBridge = this.bridgeAmount;
        }

        // Ensure we don't bridge more than the increase
        const maxBridgeAmount = difference.toFixed(18);
        if (parseFloat(amountToBridge) > difference) {
          amountToBridge = maxBridgeAmount;
        }

        console.log(`Triggering bridge for ${amountToBridge} AVAX`);

        // Trigger the wormhole bridge function
        await this.triggerBridge(amountToBridge);
      }

      // Update last balance
      this.lastBalance = currentBalance;
    } catch (error) {
      console.error(`Error checking balance: ${error}`);
    }
  }

  /**
   * Get current Avalanche balance
   */
  private async getAvalancheBalance(): Promise<string> {
    try {
      const balanceWei = await this.publicClient.getBalance({
        address: this.address as `0x${string}`,
      });

      return formatEther(balanceWei);
    } catch (error) {
      console.error(`Error getting balance: ${error}`);
      return "0";
    }
  }

  /**
   * Trigger Wormhole bridge
   */
  private async triggerBridge(amount: string): Promise<void> {
    const privateKey = await getPrivateKeyForUser(this.userId);
    if (!privateKey) {
      console.error("Private key not found for user");
      return;
    }

    try {
      await bridgeNatively("Avalanche", privateKey, amount, this.userId);
      console.log(
        `Bridge initiated for ${amount} AVAX from Avalanche to Monad`
      );
    } catch (error) {
      console.error(`Error bridging tokens: ${error}`);
    }
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log("Balance monitor stopped");
  }
}

// Store active monitors by user ID
const activeMonitors: Map<number, AvalancheBalanceMonitor> = new Map();

/**
 * Create and start a balance monitor for a user
 */
export async function monitorAvalancheBalance(
  userId: number,
  address: string,
  privateKey: string,
  config?: {
    minIncrease?: string;
    bridgeAmount?: string;
  }
): Promise<AvalancheBalanceMonitor> {
  // Check if monitoring is already active for this user
  if (activeMonitors.has(userId)) {
    return activeMonitors.get(userId)!;
  }

  const monitor = new AvalancheBalanceMonitor({
    userId,
    address,
    privateKey,
    ...config,
  });

  await monitor.start();
  activeMonitors.set(userId, monitor);

  return monitor;
}

/**
 * Get the user's private key (this should be securely stored and retrieved)
 */
async function getPrivateKeyForUser(userId: number): Promise<string | null> {
  // This is a placeholder. In a real application, you should:
  // 1. Never store private keys in plain text
  // 2. Use proper encryption/decryption
  // 3. Consider using a secure vault service

  // For demo purposes only - replace with secure implementation
  const demoPrivateKey = process.env.PRIVATE_KEY!;
  if (!demoPrivateKey) {
    console.error("DEMO_PRIVATE_KEY environment variable not set");
    return null;
  }

  return demoPrivateKey;
}

/**
 * Start monitoring for a specific wallet address
 * This function runs automatically when the application starts
 */
export async function startSingleAddressMonitoring(): Promise<void> {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    const address = privateKeyToAccount(privateKey as `0x${string}`).address;
    console.log("monitoring", address);

    if (!address || !privateKey) {
      console.error(
        "MONITOR_ADDRESS and PRIVATE_KEY must be set in environment variables"
      );
      return;
    }

    console.log(`Starting monitoring for address: ${address}`);

    // Use a placeholder user ID since we're not tracking by user
    const placeholderId = 1;

    const monitor = new AvalancheBalanceMonitor({
      userId: placeholderId,
      address,
      privateKey,
      minIncrease: "0.00001", // Minimum 0.01 AVAX increase to trigger
      bridgeAmount: "50%", // Bridge 90% of received funds
    });

    await monitor.start();
    console.log(`Monitoring started for address: ${address}`);
  } catch (error) {
    console.error(`Error starting monitoring: ${error}`);
  }
}
