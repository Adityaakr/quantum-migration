/**
 * Exposure scanner types. See ../../docs/03-exposure-scanner.md for the model:
 * an address's secp256k1 public key is revealed the moment it SENDS a transaction.
 */

export type ExposureLevel =
  | "UNEXPOSED" // never sent a tx - only the pubkey hash is on-chain (quantum-safe for now)
  | "EXPOSED" // pubkey published - derivable by a quantum computer
  | "HIGH_RISK" // exposed AND holding significant value
  | "CONTRACT"; // smart contract - no single secp256k1 key

export type ExposureReport = {
  address: string;
  level: ExposureLevel;
  isContract: boolean;
  isDelegated: boolean; // EIP-7702 delegated EOA (code = 0xef0100‖addr)
  nonce: number;
  /** Recovered uncompressed secp256k1 public key (0x04…), when available. */
  publicKey?: string;
  /** The first outgoing tx that revealed the key, when found. */
  firstSentTxHash?: string;
  valueUsd?: number;
  /** 0–100 risk score (exposure × value). */
  score: number;
  explanation: string;
  remediation?: string;
};

/** Minimal transaction metadata used for harvest-age + reuse analysis. */
export type TxMeta = {
  hash: string;
  from: string;
  to: string;
  timeStamp: number; // unix seconds
  blockNumber: number;
};

/** Pluggable source that locates an address's OUTGOING transaction hashes. */
export interface TxHistorySource {
  firstSentTxHash(address: string): Promise<string | null>;
  /** Optional: multiple sent tx hashes (oldest first) for deep audit sampling. */
  sentTxHashes?(address: string, limit?: number): Promise<string[]>;
  /** Optional: full tx metadata (in + out, oldest first) for timestamp/reuse analysis. */
  transactions?(address: string, limit?: number): Promise<TxMeta[]>;
}

/** Pluggable source that prices an address's holdings in USD. */
export interface ValuationSource {
  valueUsd(address: string): Promise<number>;
}
