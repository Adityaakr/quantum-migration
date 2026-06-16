/**
 * Deep exposure audit — runs the SDK's `deepAudit` against live chains.
 * Run: npm run demo:audit   (or QM_ADDRESS=0x… npm run demo:audit)
 *
 * Proves exposure cryptographically: recovers the public key from real
 * transactions, checks every signature recovers the SAME key, verifies that key
 * hashes to the address, and scans for ECDSA nonce reuse.
 */
import { JsonRpcProvider } from "ethers";

import { type AuditChain, blockscoutHistorySource, deepAudit } from "../src/index.js";

const ADDR =
  process.env["QM_ADDRESS"] ?? "0x3A909afa5E38479B60eaDB98df956a663c329B2f";

const chains: AuditChain[] = [
  {
    name: "Ethereum",
    chainId: 1,
    provider: new JsonRpcProvider("https://ethereum-rpc.publicnode.com"),
  },
  {
    name: "Sepolia",
    chainId: 11155111,
    provider: new JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com"),
    history: blockscoutHistorySource("https://eth-sepolia.blockscout.com/api"),
  },
  {
    name: "Hoodi",
    chainId: 560048,
    provider: new JsonRpcProvider("https://ethereum-hoodi-rpc.publicnode.com"),
    history: blockscoutHistorySource("https://eth-hoodi.blockscout.com/api"),
  },
];

async function main() {
  console.log(`\nDEEP AUDIT — ${ADDR}\n${"═".repeat(64)}`);
  const r = await deepAudit(ADDR, chains);

  console.log(`\nOVERALL: ${r.exposed ? "🟠 EXPOSED" : "🟢 UNEXPOSED"}  ·  ${r.exposingTxCount} exposing txns`);

  console.log("\nPer-chain:");
  for (const c of r.chains) {
    const v = c.error
      ? `error: ${c.error}`
      : c.isContract
        ? "contract"
        : c.exposed
          ? `🟠 EXPOSED (${c.nonce} sent)`
          : "🟢 unexposed";
    console.log(`  ${c.chain.padEnd(10)} ${v}`);
  }

  console.log("\nProof (cryptographic):");
  console.log(`  signatures analyzed : ${r.proof.signaturesAnalyzed}`);
  console.log(`  all recover one key : ${r.proof.consistent ? "✅" : "❌"}`);
  console.log(`  key hashes to addr  : ${r.proof.addressMatches ? "✅" : "❌"}`);
  console.log(`  VERIFIED            : ${r.proof.verified ? "✅ proven" : "❌"}`);
  if (r.proof.publicKey) console.log(`  public key          : ${r.proof.publicKey}`);

  console.log("\nNonce reuse (present-day classical break):");
  console.log(`  reused r values     : ${r.nonceReuse.reused ? "yes" : "no"}`);
  console.log(
    `  classically broken  : ${r.nonceReuse.classicallyBroken ? "🔴 YES — key recoverable TODAY" : "no"}`,
  );

  console.log("\nHarvest age (how long the key has been public):");
  if (r.firstExposure) {
    console.log(
      `  first exposed       : ${Math.round(r.firstExposure.ageDays)} days ago on ${r.firstExposure.chain}`,
    );
    console.log(
      `  harvestable since   : ${new Date(r.firstExposure.timestamp * 1000).toISOString().slice(0, 10)}`,
    );
  } else {
    console.log("  (no timestamped history available)");
  }
  console.log(`  reused after expose : ${r.reusedAfterExposure ? "🟠 yes — still receiving funds" : "no"}`);

  console.log("\nValue at risk (behind the exposed key):");
  for (const v of r.valueAtRisk.perChain) {
    console.log(
      `  ${v.chain.padEnd(10)} ${v.balanceFormatted} ${v.symbol}${v.valueUsd !== undefined ? ` (~$${v.valueUsd.toFixed(2)})` : ""}`,
    );
  }
  if (r.valueAtRisk.totalUsd !== undefined)
    console.log(`  TOTAL ~$${r.valueAtRisk.totalUsd.toFixed(2)}`);
  console.log(`\n${"═".repeat(64)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
