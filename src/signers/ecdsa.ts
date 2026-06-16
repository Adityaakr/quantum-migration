import { ethers } from "ethers";

import type { PreQuantumScheme, PreQuantumSigner } from "./types.js";

/**
 * ECDSA secp256k1 pre-quantum signer.
 *
 * Signs the UserOp hash RAW (via the low-level SigningKey), matching the on-chain
 * ZKNOX ECDSA verifier — NOT `signMessage`, which would add the EIP-191 prefix.
 * This is why the pre-quantum side currently requires a raw private key rather than
 * a generic injected wallet (which cannot raw-sign a digest). See docs/05-sdk-design.md.
 */
export const ecdsaSigner = (opts: {
  privateKey: string;
  scheme?: PreQuantumScheme;
}): PreQuantumSigner => {
  const wallet = new ethers.Wallet(opts.privateKey);
  const scheme = opts.scheme ?? "ecdsa-k1";

  return {
    scheme,
    async publicKey() {
      // ECDSA-k1: the on-chain "public key" is the 20-byte Ethereum address.
      return wallet.address;
    },
    async sign(userOpHash: string) {
      return wallet.signingKey.sign(userOpHash).serialized;
    },
  };
};
