import { formatEther, type Provider } from "ethers";

import { recoverPublicKeyFromResponse } from "../scanner/recover.js";
import type { TxMeta } from "../scanner/types.js";
import { detectNonceReuse } from "./nonceReuse.js";
import { proveExposure } from "./proof.js";
import type {
  AuditChain,
  ChainExposure,
  DeepAuditReport,
  SignatureSample,
} from "./types.js";

const DELEGATION_PREFIX = "0xef0100";

/** Base exposure (nonce + code + native balance) for one chain. */
const scanChain = async (
  address: string,
  c: AuditChain,
): Promise<ChainExposure> => {
  const symbol = c.nativeSymbol ?? "ETH";
  try {
    const [code, nonce, balance] = await Promise.all([
      c.provider.getCode(address),
      c.provider.getTransactionCount(address),
      c.provider.getBalance(address),
    ]);
    const isContract =
      code !== "0x" && !code.toLowerCase().startsWith(DELEGATION_PREFIX);
    const balanceFormatted = formatEther(balance);
    const valueUsd =
      c.nativeUsdPrice !== undefined
        ? Number(balanceFormatted) * c.nativeUsdPrice
        : undefined;
    return {
      chain: c.name,
      chainId: c.chainId,
      nonce,
      isContract,
      exposed: nonce > 0 && !isContract,
      balanceWei: balance.toString(),
      balanceFormatted,
      nativeSymbol: symbol,
      valueUsd,
    };
  } catch (e) {
    return {
      chain: c.name,
      chainId: c.chainId,
      nonce: 0,
      isContract: false,
      exposed: false,
      balanceWei: "0",
      balanceFormatted: "0.0",
      nativeSymbol: symbol,
      error: (e as Error).message,
    };
  }
};

/** Multi-chain exposure scan (nonce + code + balance), concurrent. */
export const scanMultiChain = (
  address: string,
  chains: AuditChain[],
): Promise<ChainExposure[]> =>
  Promise.all(chains.map((c) => scanChain(address, c)));

/** Recover signatures from specific tx hashes. */
const samplesFromHashes = async (
  provider: Provider,
  hashes: string[],
  limit: number,
): Promise<SignatureSample[]> => {
  const samples: SignatureSample[] = [];
  for (const txHash of hashes.slice(0, limit)) {
    try {
      const t = await provider.getTransaction(txHash);
      if (!t || !t.signature) continue;
      samples.push({
        txHash,
        r: t.signature.r,
        s: t.signature.s,
        publicKey: recoverPublicKeyFromResponse(t),
      });
    } catch {
      // skip unreadable tx
    }
  }
  return samples;
};

export type DeepAuditOptions = {
  /** Max signatures to sample per chain. Default 8. */
  maxSamplesPerChain?: number;
  /** "now" in unix seconds, for deterministic harvest-age (default Date.now). */
  nowSeconds?: number;
};

/**
 * Full quantum-exposure audit across chains:
 *  1. multi-chain nonce/code/balance scan,
 *  2. cryptographic exposure proof (key consistency + address binding),
 *  3. ECDSA nonce-reuse detection (present-day classical break),
 *  4. harvest-age (first exposure timestamp), reuse-after-exposure, value-at-risk.
 */
export const deepAudit = async (
  address: string,
  chains: AuditChain[],
  opts: DeepAuditOptions = {},
): Promise<DeepAuditReport> => {
  const limit = opts.maxSamplesPerChain ?? 8;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const lc = address.toLowerCase();

  const base = await scanMultiChain(address, chains);

  // Per chain: pull tx history (for samples + timestamp + reuse) where available.
  const enriched = await Promise.all(
    chains.map(async (c, i) => {
      const chainResult = base[i]!;
      if (!c.history) return { chainResult, samples: [] as SignatureSample[] };

      let txs: TxMeta[] = [];
      if (c.history.transactions) {
        txs = await c.history.transactions(address, limit * 4).catch(() => []);
      }

      const sentHashes =
        txs.length > 0
          ? txs.filter((t) => t.from.toLowerCase() === lc).map((t) => t.hash)
          : c.history.sentTxHashes
            ? await c.history.sentTxHashes(address, limit).catch(() => [])
            : [];

      const sentTs = txs
        .filter((t) => t.from.toLowerCase() === lc && t.timeStamp > 0)
        .map((t) => t.timeStamp);
      const firstExposureTimestamp = sentTs.length
        ? Math.min(...sentTs)
        : undefined;
      const reusedAfterExposure =
        firstExposureTimestamp !== undefined &&
        txs.some(
          (t) =>
            t.to.toLowerCase() === lc &&
            t.from.toLowerCase() !== lc &&
            t.timeStamp > firstExposureTimestamp,
        );

      chainResult.firstExposureTimestamp = firstExposureTimestamp;
      chainResult.reusedAfterExposure = reusedAfterExposure;

      const samples = await samplesFromHashes(c.provider, sentHashes, limit);
      return { chainResult, samples };
    }),
  );

  const chainResults = enriched.map((e) => e.chainResult);
  const samples = enriched.flatMap((e) => e.samples);

  // Aggregate: earliest exposure across chains.
  let firstExposure: DeepAuditReport["firstExposure"] = null;
  for (const c of chainResults) {
    if (c.firstExposureTimestamp === undefined) continue;
    if (!firstExposure || c.firstExposureTimestamp < firstExposure.timestamp) {
      firstExposure = {
        timestamp: c.firstExposureTimestamp,
        ageDays: Math.max(0, (now - c.firstExposureTimestamp) / 86400),
        chain: c.chain,
      };
    }
  }

  const perChainValue = chainResults
    .filter((c) => Number(c.balanceFormatted) > 0)
    .map((c) => ({
      chain: c.chain,
      balanceFormatted: c.balanceFormatted,
      symbol: c.nativeSymbol,
      valueUsd: c.valueUsd,
    }));
  const usdValues = perChainValue
    .map((c) => c.valueUsd)
    .filter((v): v is number => v !== undefined);
  const totalUsd = usdValues.length
    ? usdValues.reduce((a, b) => a + b, 0)
    : undefined;

  return {
    address,
    exposed: chainResults.some((c) => c.exposed),
    exposingTxCount: chainResults.reduce((sum, c) => sum + c.nonce, 0),
    chains: chainResults,
    proof: proveExposure(address, samples),
    nonceReuse: detectNonceReuse(samples),
    firstExposure,
    reusedAfterExposure: chainResults.some((c) => c.reusedAfterExposure),
    valueAtRisk: { totalUsd, perChain: perChainValue },
  };
};
