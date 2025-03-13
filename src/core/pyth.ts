import { HermesClient } from "@pythnetwork/hermes-client";

export async function getMonPrice() {
  const priceServiceConnection = new HermesClient(
    "https://hermes-beta.pyth.network",
    {}
  );

  const priceUpdateData = await priceServiceConnection.getLatestPriceUpdates(
    // Price feed of Mon/USD
    ["0xe786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b"],
    { encoding: "base64" }
  );

  const decimals = Math.abs(priceUpdateData?.parsed?.[0].price.expo ?? 8);

  const price = priceUpdateData?.parsed?.[0].price.price;
  return {
    price: price,
    decimals: decimals,
  };
}
