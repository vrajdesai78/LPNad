// src/scripts/rpcPingTest.ts
import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";

// List of RPC URLs to test
const RPC_URLS = [
  process.env.ALCHEMY_HTTP_TRANSPORT_URL,
  // Add any other RPC URLs you want to test
];

// Configuration
const TEST_COUNT = 5; // Number of ping tests per RPC
const TIMEOUT_MS = 5000; // Timeout in milliseconds

/**
 * Run a single ping test to an RPC endpoint
 */
async function pingRPC(
  rpcUrl: string
): Promise<{ success: boolean; latency: number; error?: any }> {
  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl, {
      timeout: TIMEOUT_MS,
    }),
  });

  const startTime = performance.now();
  try {
    // Try to get the current block number as a simple ping test
    const blockNumber = await client.getBlockNumber();
    const endTime = performance.now();
    return {
      success: true,
      latency: endTime - startTime,
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      success: false,
      latency: endTime - startTime,
      error,
    };
  }
}

/**
 * Run multiple ping tests and calculate statistics
 */
async function testRPC(rpcUrl: string): Promise<void> {
  console.log(`\n📡 Testing RPC: ${rpcUrl}`);
  console.log("═".repeat(60));

  const results = [];
  let successCount = 0;

  for (let i = 0; i < TEST_COUNT; i++) {
    process.stdout.write(`Test ${i + 1}/${TEST_COUNT}: `);
    const result = await pingRPC(rpcUrl);

    if (result.success) {
      successCount++;
      process.stdout.write(`✅ ${result.latency.toFixed(2)}ms\n`);
    } else {
      process.stdout.write(
        `❌ Failed after ${result.latency.toFixed(2)}ms - ${
          result.error?.message || "Unknown error"
        }\n`
      );
    }

    results.push(result);
  }

  // Calculate statistics
  const successRate = (successCount / TEST_COUNT) * 100;
  const latencies = results.filter((r) => r.success).map((r) => r.latency);

  if (latencies.length === 0) {
    console.log("\n🔴 All ping tests failed!");
    return;
  }

  const avgLatency =
    latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);

  // Additional checks
  try {
    const client = createPublicClient({
      chain: monadTestnet,
      transport: http(rpcUrl),
    });

    // Get additional information
    const [chainId, blockNumber, gasPrice] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getGasPrice(),
    ]);

    console.log("\n📊 Results:");
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`Avg Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Min Latency: ${minLatency.toFixed(2)}ms`);
    console.log(`Max Latency: ${maxLatency.toFixed(2)}ms`);
    console.log(`Chain ID: ${chainId}`);
    console.log(`Block Number: ${blockNumber}`);
    console.log(`Gas Price: ${gasPrice}`);

    // Rate the RPC
    let rating = "Unknown";
    if (avgLatency < 100) rating = "Excellent";
    else if (avgLatency < 300) rating = "Good";
    else if (avgLatency < 700) rating = "Fair";
    else rating = "Poor";

    if (successRate < 80) rating = "Unreliable";

    console.log(`\n📝 Rating: ${rating}`);
  } catch (error) {
    console.log("\n⚠️ Failed to get additional information");
    console.error(error);
  }
}

/**
 * Main function to test all RPC endpoints
 */
async function main() {
  console.log("🔍 Monad RPC Ping Test");
  console.log("═".repeat(60));

  await testRPC(process.env.ALCHEMY_HTTP_TRANSPORT_URL!);

  console.log("\n✨ Testing complete!");
}

// Run the script
main().catch((error) => {
  console.error("❌ Error running tests:", error);
  process.exit(1);
});
