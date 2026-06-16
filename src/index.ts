// Quantum Migration SDK — hybrid post-quantum ERC-4337 account (ECDSA + ML-DSA).
// See ../docs/05-sdk-design.md for the design rationale.

// High-level account API
export { PQAccount } from "./account.js";
export type { Call, PQAccountOptions } from "./account.js";

// Signers (pluggable key sourcing)
export { ecdsaSigner } from "./signers/ecdsa.js";
export { mlDsa44Signer } from "./signers/mldsa.js";
export type {
  PostQuantumScheme,
  PostQuantumSigner,
  PreQuantumScheme,
  PreQuantumSigner,
} from "./signers/types.js";

// Bundler
export { BundlerClient, pimlico } from "./bundler/client.js";
export type { UserOpReceipt } from "./bundler/client.js";

// Deployments
export {
  type AccountMode,
  CHAIN_TO_NETWORK,
  DEPLOYMENTS,
  getFactoryAddress,
  type NetworkKey,
  networkForChainId,
} from "./deployments.js";

// Core primitives (escape hatch for advanced use)
export {
  ACCOUNT_ABI,
  createBaseUserOperation,
  encodeExecute,
  encodeExecuteBatch,
  ENTRY_POINT_ADDRESS,
  getUserOpHash,
  packUint128,
  unpackUint128,
  updateUserOpWithGasEstimates,
  userOpToBundlerFormat,
} from "./core/userOperation.js";
export type { GasEstimates, UserOperation } from "./core/userOperation.js";

// Encoding
export { to_expanded_encoded_bytes } from "./encoding/mldsa.js";
export { hexToU8 } from "./hex.js";

