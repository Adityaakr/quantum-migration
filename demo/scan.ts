/**
 * Exposure scanner demo. Run: `npm run demo:scan`
 *
 * By default runs OFFLINE against a fake provider (always works, no network) to show
 * the three verdicts. Set QM_RPC_URL to scan a real address on a live RPC:
 *
 *   QM_RPC_URL=https://… QM_ADDRESS=vitalik.eth npm run demo:scan
 */
import { JsonRpcProvider, Transaction, Wallet } from "ethers";

import { ExposureScanner, type ExposureReport } from "../src/index.js";

const print = (label: string, r: ExposureReport) => {
  const badge = { UNEXPOSED: "🟢", EXPOSED: "🟠", HIGH_RISK: "🔴", CONTRACT: "⚪" }[
    r.level
  ];
  console.log(`\n${badge}  ${label} → ${r.level}  (score ${r.score})`);
  console.log(`   ${r.address}`);
  if (r.valueUsd !== undefined) console.log(`   value: $${r.valueUsd.toLocaleString()}`);
  if (r.publicKey) console.log(`   pubkey: ${r.publicKey.slice(0, 30)}…`);
  console.log(`   ${r.explanation}`);
  if (r.remediation) console.log(`   → ${r.remediation}`);
};

async function live(rpcUrl: string, address: string) {
  const scanner = new ExposureScanner({ provider: new JsonRpcProvider(rpcUrl) });
  print(address, await scanner.scan(address));
}

async function offline() {
  console.log("Running OFFLINE demo (set QM_RPC_URL to scan a real address)\n");
  const wallet = new Wallet("0x" + "44".repeat(32));

  // Pre-sign a real tx so the EXPOSED case can recover a genuine public key.
  const raw = await wallet.signTransaction({
    type: 2,
    chainId: 421614n,
    nonce: 0,
    to: wallet.address,
    value: 0n,
    gasLimit: 21000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const tx = Transaction.from(raw);

  const provider = (over: Record<string, unknown>) =>
    ({
      getCode: async () => "0x",
      getTransactionCount: async () => 0,
      resolveName: async () => null,
      getTransaction: async () => tx,
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  print(
    "fresh wallet, never sent",
    await new ExposureScanner({
      provider: provider({ getTransactionCount: async () => 0 }),
    }).scan(wallet.address),
  );

  print(
    "active wallet, $250k",
    await new ExposureScanner({
      provider: provider({ getTransactionCount: async () => 42 }),
      history: { firstSentTxHash: async () => tx.hash! },
      valuation: { valueUsd: async () => 250_000 },
    }).scan(wallet.address),
  );

  print(
    "a smart contract",
    await new ExposureScanner({
      provider: provider({ getCode: async () => "0x60806040" }),
    }).scan(wallet.address),
  );
}

const rpc = process.env["QM_RPC_URL"];
const addr = process.env["QM_ADDRESS"];
(rpc && addr ? live(rpc, addr) : offline()).catch((e) => {
  console.error(e);
  process.exit(1);
});
