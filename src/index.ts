// Quantum Migration SDK - hybrid post-quantum ERC-4337 account (ECDSA + ML-DSA).
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

// Migration / sweep (Milestone 2)
export {
  computeEthSweepValue,
  EthersSweepExecutor,
  sweepFrom,
} from "./migrate/sweep.js";
export type {
  SweepExecutor,
  SweepOptions,
  SweepReport,
  SweepResult,
} from "./migrate/sweep.js";

// Exposure scanner (Milestone 1)
export { ExposureScanner } from "./scanner/scanner.js";
export type { ExposureScannerOptions } from "./scanner/scanner.js";
export {
  recoverPublicKeyFromResponse,
  recoverPublicKeyFromTxHash,
} from "./scanner/recover.js";
export {
  alchemyHistorySource,
  blockscoutHistorySource,
  etherscanHistorySource,
} from "./scanner/history.js";

// Deep audit (exposure proof + nonce-reuse + multi-chain)
export {
  deepAudit,
  type DeepAuditOptions,
  scanMultiChain,
} from "./audit/audit.js";
export { detectNonceReuse } from "./audit/nonceReuse.js";
export { proveExposure, verifyAddressBinding } from "./audit/proof.js";
export type {
  AuditChain,
  ChainExposure,
  DeepAuditReport,
  ExposureProof,
  NonceReuseFinding,
  SignatureSample,
} from "./audit/types.js";
export type {
  ExposureLevel,
  ExposureReport,
  TxHistorySource,
  TxMeta,
  ValuationSource,
} from "./scanner/types.js";
