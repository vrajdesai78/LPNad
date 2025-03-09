import {
  Chain,
  Network,
  Wormhole,
  amount as amountHelper,
  wormhole,
  TokenId,
  TokenTransfer,
} from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { SignerStuff, getSigner, getTokenDecimals } from "./helpers";

export async function bridgeNatively(
  sendingChain: Chain,
  userkey: string,
  amount: string
) {
  const wh = await wormhole("Testnet", [evm]);

  const sendChain = wh.getChain(sendingChain);
  const rcvChain = wh.getChain("Monad");

  const source = await getSigner(sendChain, userkey);
  const destination = await getSigner(rcvChain, userkey);

  const token = Wormhole.tokenId(sendChain.chain, "native");

  const amt = amount;

  const automatic = false;

  const nativeGas = automatic ? "0" : undefined;

  const decimals = await getTokenDecimals(wh, token, sendChain);

  const xfer = await tokenTransfer(wh, {
    token,
    amount: amountHelper.units(amountHelper.parse(amt, decimals)),
    source,
    destination,
    delivery: {
      automatic,
      nativeGas: nativeGas
        ? amountHelper.units(amountHelper.parse(nativeGas, decimals))
        : undefined,
    },
  });

  process.exit(0);
}

async function tokenTransfer<N extends Network>(
  wh: Wormhole<N>,
  route: {
    token: TokenId;
    amount: bigint;
    source: SignerStuff<N, Chain>;
    destination: SignerStuff<N, Chain>;
    delivery?: {
      automatic: boolean;
      nativeGas?: bigint;
    };
    payload?: Uint8Array;
  }
) {
  // EXAMPLE_TOKEN_TRANSFER
  // Create a TokenTransfer object to track the state of the transfer over time
  const xfer = await wh.tokenTransfer(
    route.token,
    route.amount,
    route.source.address,
    route.destination.address,
    route.delivery?.automatic ?? false,
    route.payload,
    route.delivery?.nativeGas
  );

  const quote = await TokenTransfer.quoteTransfer(
    wh,
    route.source.chain,
    route.destination.chain,
    xfer.transfer
  );

  if (xfer.transfer.automatic && quote.destinationToken.amount < 0)
    throw "The amount requested is too low to cover the fee and any native gas requested.";

  // 1) Submit the transactions to the source chain, passing a signer to sign any txns
  console.log("Starting transfer");
  console.log(" ");
  const srcTxids = await xfer.initiateTransfer(route.source.signer);
  console.log(`${route.source.signer.chain()} Trasaction ID: ${srcTxids[0]}`);
  console.log(`Wormhole Trasaction ID: ${srcTxids[1] ?? srcTxids[0]}`);
  console.log(" ");

  // 2) Wait for the VAA to be signed and ready (not required for auto transfer)
  console.log("Getting Attestation");
  const timeout = 25 * 60 * 1000; // Timeout in milliseconds (25 minutes)
  await xfer.fetchAttestation(timeout);
  // console.log(`Got Attestation: `, attestIds);
  console.log(" ");

  // 3) Redeem the VAA on the dest chain
  console.log("Completing Transfer");
  // console.log('Destination Signer:', route.destination.signer);
  console.log(" ");
  const destTxids = await xfer.completeTransfer(route.destination.signer);
  console.log(`Completed Transfer: `, destTxids);
  console.log(" ");
  console.log("Transfer completed successfully");
}
