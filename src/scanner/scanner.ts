import { getAddress, isAddress, type Provider } from "ethers";

import { recoverPublicKeyFromTxHash } from "./recover.js";
import type {
  ExposureLevel,
  ExposureReport,
  TxHistorySource,
  ValuationSource,
} from "./types.js";

/** EIP-7702 delegation indicator prefix: code = 0xef0100 ‖ delegate address. */
const DELEGATION_PREFIX = "0xef0100";

export type ExposureScannerOptions = {
  provider: Provider;
  /** Optional: locates the first sent tx so the actual public key can be recovered. */
  history?: TxHistorySource;
  /** Optional: prices holdings to distinguish EXPOSED from HIGH_RISK. */
  valuation?: ValuationSource;
  /** USD threshold above which an exposed address is HIGH_RISK. Default 1000. */
  highValueThresholdUsd?: number;
};

const score = (level: ExposureLevel, valueUsd?: number): number => {
  if (level === "UNEXPOSED" || level === "CONTRACT") return 0;
  const base = level === "HIGH_RISK" ? 80 : 50;
  // Add up to 20 points scaled by log10 of USD value (so $1M ≈ +20).
  const v = valueUsd ?? 0;
  const bonus = v > 0 ? Math.min(20, Math.log10(v + 1) * 3.3) : 0;
  return Math.round(base + bonus);
};

/**
 * Scans an Ethereum address for quantum exposure.
 *
 * Fast path: `getCode` (EOA vs contract vs 7702-delegated) + `getTransactionCount`
 * (nonce > 0 ⟺ public key exposed). The actual public key and USD value are only
 * resolved when the optional history/valuation sources are provided.
 */
export class ExposureScanner {
  private readonly provider: Provider;
  private readonly history?: TxHistorySource;
  private readonly valuation?: ValuationSource;
  private readonly threshold: number;

  constructor(opts: ExposureScannerOptions) {
    this.provider = opts.provider;
    this.history = opts.history;
    this.valuation = opts.valuation;
    this.threshold = opts.highValueThresholdUsd ?? 1000;
  }

  /** Resolve an address or ENS name to a checksummed address. */
  async resolve(addressOrEns: string): Promise<string> {
    if (isAddress(addressOrEns)) return getAddress(addressOrEns);
    const resolved = await this.provider.resolveName(addressOrEns);
    if (!resolved) throw new Error(`Could not resolve "${addressOrEns}"`);
    return getAddress(resolved);
  }

  async scan(addressOrEns: string): Promise<ExposureReport> {
    const address = await this.resolve(addressOrEns);
    const code = await this.provider.getCode(address);
    const isDelegated = code.toLowerCase().startsWith(DELEGATION_PREFIX);
    const isContract = code !== "0x" && !isDelegated;

    if (isContract) {
      return {
        address,
        level: "CONTRACT",
        isContract: true,
        isDelegated: false,
        nonce: 0,
        score: 0,
        explanation:
          "This is a smart contract. It has no single secp256k1 key to expose. " +
          "The quantum surface is its privileged owner / signer EOAs.",
      };
    }

    const nonce = await this.provider.getTransactionCount(address);

    const firstSentTxHash = this.history
      ? await this.history.firstSentTxHash(address).catch(() => null)
      : null;

    const hasSent = nonce > 0 || isDelegated || firstSentTxHash !== null;

    if (!hasSent) {
      return {
        address,
        level: "UNEXPOSED",
        isContract: false,
        isDelegated: false,
        nonce,
        score: 0,
        explanation:
          "This address has never sent a transaction, so only the hash of its public " +
          "key is on-chain. It is quantum-safe until its first outgoing transaction.",
      };
    }

    // EXPOSED - recover the actual public key for display when we have a tx to read.
    let publicKey: string | undefined;
    if (firstSentTxHash) {
      publicKey = await recoverPublicKeyFromTxHash(
        this.provider,
        firstSentTxHash,
      ).catch(() => undefined);
    }

    const valueUsd = this.valuation
      ? await this.valuation.valueUsd(address).catch(() => undefined)
      : undefined;

    const level: ExposureLevel =
      (valueUsd ?? 0) >= this.threshold ? "HIGH_RISK" : "EXPOSED";

    return {
      address,
      level,
      isContract: false,
      isDelegated,
      nonce,
      publicKey,
      firstSentTxHash: firstSentTxHash ?? undefined,
      valueUsd,
      score: score(level, valueUsd),
      explanation:
        (isDelegated
          ? "This is an EIP-7702 delegated EOA that has signed transactions, so "
          : "This address has sent at least one transaction, so ") +
        "its secp256k1 public key is published on-chain. A quantum computer running " +
        "Shor's algorithm could derive the private key from it.",
      remediation:
        "Migrate funds to a fresh hybrid post-quantum account and retire this address.",
    };
  }
}
