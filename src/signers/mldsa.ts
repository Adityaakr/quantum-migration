import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import { ethers } from "ethers";

import { to_expanded_encoded_bytes } from "../encoding/mldsa.js";
import { hexToU8 } from "../hex.js";
import type { PostQuantumSigner } from "./types.js";

/**
 * ML-DSA-44 (CRYSTALS-Dilithium) post-quantum signer, derived deterministically
 * from a 32-byte seed. Same seed → same key, so the seed must be reproducible by
 * the user to later spend (passkey-derived or keystore-backed sourcing recommended;
 * see docs/05-sdk-design.md §PQSigner).
 */
export const mlDsa44Signer = (opts: {
  seed: string | Uint8Array;
}): PostQuantumSigner => {
  const seedBytes =
    typeof opts.seed === "string" ? hexToU8(opts.seed, 32) : opts.seed;
  const { publicKey, secretKey } = ml_dsa44.keygen(seedBytes);

  return {
    scheme: "ml-dsa-44",
    async publicKeyEncoded() {
      return to_expanded_encoded_bytes(publicKey);
    },
    async sign(userOpHash: string) {
      const sig = ml_dsa44.sign(ethers.getBytes(userOpHash), secretKey);
      return ethers.hexlify(sig);
    },
  };
};
