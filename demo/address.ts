/**
 * Offline demo - proves the SDK works without any network.
 * Run: `npm run demo`
 *
 * Derives both keypairs from seeds, builds + hybrid-signs a UserOperation, and
 * shows the (bytes, bytes) signature the on-chain account decodes. No RPC needed.
 */
import { ethers } from "ethers";

import {
  ecdsaSigner,
  encodeExecute,
  getUserOpHash,
  mlDsa44Signer,
  packUint128,
  type UserOperation,
} from "../src/index.js";

const PRE_SEED = "0x" + "11".repeat(32); // ECDSA private key
const POST_SEED = "0x" + "22".repeat(32); // ML-DSA seed

async function main() {
  const pre = ecdsaSigner({ privateKey: PRE_SEED });
  const post = mlDsa44Signer({ seed: POST_SEED });

  const preKey = await pre.publicKey();
  const postKey = await post.publicKeyEncoded();

  console.log("Pre-quantum  (ECDSA address):", preKey);
  console.log("Post-quantum (ML-DSA pubkey):", postKey.slice(0, 42) + "…");
  console.log("  encoded length:", (postKey.length - 2) / 2, "bytes\n");

  const userOp: UserOperation = {
    sender: "0x1111111111111111111111111111111111111111",
    nonce: 0n,
    initCode: "0x",
    callData: encodeExecute(
      "0x2222222222222222222222222222222222222222",
      ethers.parseEther("0.01"),
      "0x",
    ),
    accountGasLimits: packUint128(13_500_000n, 500_000n),
    preVerificationGas: 1_000_000n,
    gasFees: packUint128(100_000_000n, 200_000_000n),
    paymasterAndData: "0x",
    signature: "0x",
  };

  const chainId = 421614n; // Arbitrum Sepolia
  const hash = getUserOpHash(userOp, ethers.ZeroAddress, chainId);
  console.log("UserOp hash:", hash);

  const preSig = await pre.sign(hash);
  const postSig = await post.sign(hash);
  const hybrid = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "bytes"],
    [preSig, postSig],
  );

  console.log("ECDSA sig:   ", preSig);
  console.log("ML-DSA sig:  ", postSig.slice(0, 42) + "…", `(${(postSig.length - 2) / 2} bytes)`);
  console.log("Hybrid sig:  ", (hybrid.length - 2) / 2, "bytes (abi-encoded (bytes,bytes))\n");

  // Verify the ECDSA half recovers the right signer (sanity check, offline)
  const recovered = ethers.recoverAddress(hash, preSig);
  console.log("ECDSA recovers to expected signer:", recovered === preKey, "✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
