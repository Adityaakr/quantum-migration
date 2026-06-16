/**
 * Pluggable signer abstractions. The hybrid account requires one pre-quantum
 * (classical) and one post-quantum signature per UserOperation.
 *
 * Each signer owns BOTH its public-key material (for account creation / address
 * derivation) and the signing operation over a UserOp hash. This is the seam that
 * lets key sourcing (raw seed, passkey-derived, hardware) be swapped without
 * touching the UserOp machinery.
 */

export type PreQuantumScheme = "ecdsa-k1" | "ecdsa-r1";
export type PostQuantumScheme = "ml-dsa-44" | "falcon-512" | "ethfalcon";

export interface PreQuantumSigner {
  readonly scheme: PreQuantumScheme;
  /** Public key as stored on-chain. For ECDSA-k1 this is the 20-byte address. */
  publicKey(): Promise<string>;
  /** Raw signature over a 32-byte UserOp hash (no EIP-191 prefix). */
  sign(userOpHash: string): Promise<string>;
}

export interface PostQuantumSigner {
  readonly scheme: PostQuantumScheme;
  /** Expanded + ABI-encoded public key blob the account stores on-chain. */
  publicKeyEncoded(): Promise<string>;
  /** Signature over a 32-byte UserOp hash. */
  sign(userOpHash: string): Promise<string>;
}
