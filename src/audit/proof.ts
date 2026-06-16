import { getBytes, keccak256 } from "ethers";

import type { ExposureProof, SignatureSample } from "./types.js";

/**
 * Verify the defining property of an Ethereum address: it is the last 20 bytes of
 * keccak256 of the 64-byte public key. If this holds, the recovered key provably
 * belongs to the address - not a coincidence, not "random stuff".
 */
export const verifyAddressBinding = (
  publicKey: string,
  address: string,
): boolean => {
  // Drop the 0x04 uncompressed prefix, hash the 64-byte key, take the last 20 bytes.
  const hash = keccak256(getBytes(publicKey).slice(1));
  return "0x" + hash.slice(-40) === address.toLowerCase();
};

/**
 * Prove exposure from a set of recovered signatures: all must recover the SAME key
 * AND that key must hash to the address.
 */
export const proveExposure = (
  address: string,
  samples: SignatureSample[],
): ExposureProof => {
  if (samples.length === 0) {
    return {
      publicKey: null,
      signaturesAnalyzed: 0,
      consistent: false,
      addressMatches: false,
      verified: false,
    };
  }

  const keys = new Set(samples.map((s) => s.publicKey.toLowerCase()));
  const consistent = keys.size === 1;
  const publicKey = samples[0]!.publicKey;
  const addressMatches = verifyAddressBinding(publicKey, address);

  return {
    publicKey,
    signaturesAnalyzed: samples.length,
    consistent,
    addressMatches,
    verified: consistent && addressMatches,
  };
};
