import type { Provider } from "ethers";

import type { TxHistorySource } from "../scanner/types.js";

/** One signature recovered from a sent transaction. */
export type SignatureSample = {
  txHash: string;
  r: string;
  s: string;
  publicKey: string; // recovered uncompressed secp256k1 key (0x04…)
};

/**
 * Cryptographic proof that an address's public key is exposed:
 *  - `consistent`: every analyzed signature recovers the SAME key.
 *  - `addressMatches`: keccak256(key)[12:] equals the address.
 * Both true ⇒ mathematically certain the key is this address's key.
 */
export type ExposureProof = {
  publicKey: string | null;
  signaturesAnalyzed: number;
  consistent: boolean;
  addressMatches: boolean;
  verified: boolean;
};

/**
 * ECDSA nonce-reuse: two signatures sharing the same `r` with different `s` means
 * the same per-signature nonce `k` was reused — the private key is recoverable
 * TODAY with classical algebra (no quantum needed).
 */
export type NonceReuseFinding = {
  reused: boolean;
  classicallyBroken: boolean;
  collisions: { r: string; txHashes: string[] }[];
};

/** Per-chain exposure (nonce > 0 ⟺ key published on that chain). */
export type ChainExposure = {
  chain: string;
  chainId?: number;
  nonce: number;
  isContract: boolean;
  exposed: boolean;
  /** Native balance (wei, as string for JSON-safety) + formatted + symbol. */
  balanceWei: string;
  balanceFormatted: string;
  nativeSymbol: string;
  valueUsd?: number;
  /** Unix seconds of the first OUTGOING tx on this chain (key first published). */
  firstExposureTimestamp?: number;
  /** Received funds AFTER first exposure (growing liability). */
  reusedAfterExposure?: boolean;
  error?: string;
};

export type AuditChain = {
  name: string;
  chainId?: number;
  provider: Provider;
  /** Optional: enables signature sampling (proof + nonce-reuse) for this chain. */
  history?: TxHistorySource;
  /** Native currency symbol (default "ETH"). */
  nativeSymbol?: string;
  /** Optional USD price of 1 native unit, for value-at-risk. */
  nativeUsdPrice?: number;
};

export type DeepAuditReport = {
  address: string;
  exposed: boolean;
  exposingTxCount: number;
  chains: ChainExposure[];
  proof: ExposureProof;
  nonceReuse: NonceReuseFinding;
  /** Earliest exposure across chains — how long the key has been harvestable. */
  firstExposure: { timestamp: number; ageDays: number; chain: string } | null;
  /** Any chain received funds after exposure. */
  reusedAfterExposure: boolean;
  /** Native value currently sitting behind the exposed key. */
  valueAtRisk: {
    totalUsd?: number;
    perChain: {
      chain: string;
      balanceFormatted: string;
      symbol: string;
      valueUsd?: number;
    }[];
  };
};
