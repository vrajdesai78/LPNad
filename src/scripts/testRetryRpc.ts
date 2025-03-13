import { createReliablePublicClient, getAllRpcUrls } from "../utils/rpcClient";
import { formatEther } from "viem";
import { config } from "dotenv";

config();

/**
 * Test the RPC retry logic by making multiple requests
 */
async function testRetryLogic() {
  console.log("🔄 Testing RPC Retry Logic");
  console.log("═".repeat(60));

  // Get all available RPC URLs
  const rpcUrls = getAllRpcUrls();
  console.log(`Available RPC URLs (${rpcUrls.length}):`);
  rpcUrls.forEach((url, index) => {
    console.log(`${index + 1}. ${url}`);
  });

  // Create a client with retry logic
  const client = createReliablePublicClient();

  console.log("\n🧪 Running tests...");

  try {
    // Test 1: Get chain ID
    console.log("\nTest 1: Get Chain ID");
    const chainId = await client.getChainId();
    console.log(`✅ Chain ID: ${chainId}`);

    // Test 2: Get block number
    console.log("\nTest 2: Get Block Number");
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ Block Number: ${blockNumber}`);

    // Test 3: Get gas price
    console.log("\nTest 3: Get Gas Price");
    const gasPrice = await client.getGasPrice();
    console.log(`✅ Gas Price: ${formatEther(gasPrice)} ETH`);

    // Test 4: Get a specific block
    console.log("\nTest 4: Get Block Details");
    const block = await client.getBlock();
    console.log(`✅ Latest Block Hash: ${block.hash}`);
    console.log(`✅ Latest Block Number: ${block.number}`);
    console.log(
      `✅ Latest Block Timestamp: ${new Date(
        Number(block.timestamp) * 1000
      ).toISOString()}`
    );

    // Test 5: Simulate a failure by using an invalid method (to trigger retry)
    console.log("\nTest 5: Simulate Failure (to test retry logic)");
    try {
      // @ts-ignore - Intentionally calling an invalid method to test retry
      await client.invalidMethod();
    } catch (error) {
      console.log(`✅ Expected error caught: ${(error as Error).message}`);
    }
  } catch (error) {
    console.error(`❌ Test failed: ${(error as Error).message}`);
  }

  console.log("\n✨ Testing complete!");
}

// Run the test
testRetryLogic().catch(console.error);
