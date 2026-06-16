/**
 * Live testnet exercise (read-only) — proves the SDK talks to the REAL deployed
 * ZKNOX factory on Arbitrum Sepolia. No funds needed.
 *
 * Run: npm run demo:testnet
 */
import { JsonRpcProvider } from "ethers";

import {
  ecdsaSigner,
  ExposureScanner,
  mlDsa44Signer,
  pimlico,
  PQAccount,
} from "../src/index.js";

const RPC = process.env["QM_RPC_URL"] ?? "https://arbitrum-sepolia-rpc.publicnode.com";

function seed(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "0x" + Buffer.from(b).toString("hex");
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  console.log(`Network: ${net.name} (chainId ${net.chainId})\n`);

  const ecdsa = seed();
  const mldsa = seed();
  console.log("Generated a fresh hybrid keypair:");
  console.log("  ECDSA key:  ", ecdsa);
  console.log("  ML-DSA seed:", mldsa, "\n");

  console.log("Creating PQAccount and resolving its address via the LIVE factory…");
  const account = await PQAccount.create({
    preQuantum: ecdsaSigner({ privateKey: ecdsa }),
    postQuantum: mlDsa44Signer({ seed: mldsa }),
    provider,
    bundler: pimlico(""), // unused for getAddress
  });

  const address = await account.getAddress(); // ← real eth_call to factory.getAddress()
  const deployed = await account.isDeployed();
  console.log("  → Counterfactual account address:", address);
  console.log("  → Deployed yet:", deployed, "\n");

  console.log("Scanning that fresh account address…");
  const report = await new ExposureScanner({ provider }).scan(address);
  console.log(`  → ${report.level} (score ${report.score}) — ${report.explanation}\n`);

  console.log("✅ SDK successfully derived a deterministic account from the live");
  console.log("   testnet factory. Funding + deploy + sweep happen in the app UI.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
