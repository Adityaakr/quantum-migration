import { computeAddress, Transaction, Wallet } from "ethers";
import { describe, expect, it } from "vitest";

import {
  type AuditChain,
  deepAudit,
  detectNonceReuse,
  proveExposure,
  recoverPublicKeyFromResponse,
  scanMultiChain,
  type SignatureSample,
  type TxMeta,
  verifyAddressBinding,
} from "../src/index.js";

const wallet = new Wallet("0x" + "55".repeat(32));

async function realSample(nonce: number): Promise<SignatureSample> {
  const raw = await wallet.signTransaction({
    type: 2,
    chainId: 1n,
    nonce,
    to: "0x2222222222222222222222222222222222222222",
    value: 0n,
    gasLimit: 21000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const tx = Transaction.from(raw);
  return {
    txHash: tx.hash!,
    r: tx.signature!.r,
    s: tx.signature!.s,
    publicKey: recoverPublicKeyFromResponse(tx as never),
  };
}

const fakeProvider = (over: Record<string, unknown>) =>
  ({
    getCode: async () => "0x",
    getTransactionCount: async () => 0,
    getBalance: async () => 0n,
    getTransaction: async () => null,
    ...over,
  }) as never;

describe("verifyAddressBinding", () => {
  it("confirms a recovered key hashes to its address", () => {
    expect(verifyAddressBinding(wallet.signingKey.publicKey, wallet.address)).toBe(true);
  });
  it("rejects a key that does not match the address", () => {
    expect(
      verifyAddressBinding(wallet.signingKey.publicKey, "0x" + "00".repeat(20)),
    ).toBe(false);
  });
});

describe("proveExposure", () => {
  it("verifies when all signatures recover the same key bound to the address", async () => {
    const samples = [await realSample(0), await realSample(1), await realSample(2)];
    const proof = proveExposure(wallet.address, samples);
    expect(proof.signaturesAnalyzed).toBe(3);
    expect(proof.consistent).toBe(true);
    expect(proof.addressMatches).toBe(true);
    expect(proof.verified).toBe(true);
    expect(computeAddress(proof.publicKey!)).toBe(wallet.address);
  });

  it("is not verified with no samples", () => {
    expect(proveExposure(wallet.address, []).verified).toBe(false);
  });

  it("flags inconsistency when keys differ", async () => {
    const a = await realSample(0);
    const other = new Wallet("0x" + "66".repeat(32));
    const bRaw = await other.signTransaction({
      type: 2, chainId: 1n, nonce: 0, to: a.txHash.slice(0, 42),
      value: 0n, gasLimit: 21000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n,
    });
    const bTx = Transaction.from(bRaw);
    const b: SignatureSample = {
      txHash: bTx.hash!, r: bTx.signature!.r, s: bTx.signature!.s,
      publicKey: recoverPublicKeyFromResponse(bTx as never),
    };
    expect(proveExposure(wallet.address, [a, b]).consistent).toBe(false);
  });
});

describe("detectNonceReuse", () => {
  const mk = (txHash: string, r: string, s: string): SignatureSample => ({
    txHash, r, s, publicKey: "0x04",
  });

  it("finds no reuse for distinct r values", () => {
    const f = detectNonceReuse([mk("0x1", "0xaa", "0x11"), mk("0x2", "0xbb", "0x22")]);
    expect(f.reused).toBe(false);
    expect(f.classicallyBroken).toBe(false);
  });

  it("flags a classical break on shared r with different s", () => {
    const f = detectNonceReuse([mk("0x1", "0xaa", "0x11"), mk("0x2", "0xaa", "0x99")]);
    expect(f.reused).toBe(true);
    expect(f.classicallyBroken).toBe(true);
    expect(f.collisions[0]?.txHashes).toEqual(["0x1", "0x2"]);
  });

  it("does not flag a duplicate signature (same r AND s) as a break", () => {
    const f = detectNonceReuse([mk("0x1", "0xaa", "0x11"), mk("0x2", "0xaa", "0x11")]);
    expect(f.reused).toBe(true); // r repeats…
    expect(f.classicallyBroken).toBe(false); // …but s identical ⇒ just a dup, not a break
  });
});

describe("scanMultiChain", () => {
  it("marks exposed if any chain has nonce > 0", async () => {
    const chains = [
      { name: "A", provider: fakeProvider({ getTransactionCount: async () => 0 }) },
      { name: "B", provider: fakeProvider({ getTransactionCount: async () => 7 }) },
    ];
    const res = await scanMultiChain(wallet.address, chains);
    expect(res.find((c) => c.chain === "A")?.exposed).toBe(false);
    expect(res.find((c) => c.chain === "B")?.exposed).toBe(true);
    expect(res.find((c) => c.chain === "B")?.nonce).toBe(7);
  });

  it("does not mark contracts as exposed", async () => {
    const chains = [
      {
        name: "C",
        provider: fakeProvider({
          getCode: async () => "0x6080",
          getTransactionCount: async () => 3,
        }),
      },
    ];
    const res = await scanMultiChain(wallet.address, chains);
    expect(res[0]?.isContract).toBe(true);
    expect(res[0]?.exposed).toBe(false);
  });

  it("records a per-chain error without failing the whole scan", async () => {
    const chains = [
      {
        name: "Bad",
        provider: fakeProvider({
          getCode: async () => {
            throw new Error("rpc down");
          },
        }),
      },
    ];
    const res = await scanMultiChain(wallet.address, chains);
    expect(res[0]?.error).toContain("rpc down");
    expect(res[0]?.exposed).toBe(false);
  });

  it("reports native balance + USD value", async () => {
    const chains: AuditChain[] = [
      {
        name: "Eth",
        nativeSymbol: "ETH",
        nativeUsdPrice: 3000,
        provider: fakeProvider({
          getTransactionCount: async () => 1,
          getBalance: async () => 2n * 10n ** 18n, // 2 ETH
        }),
      },
    ];
    const res = await scanMultiChain(wallet.address, chains);
    expect(res[0]?.balanceFormatted).toBe("2.0");
    expect(res[0]?.valueUsd).toBe(6000);
  });
});

describe("deepAudit — harvest-age, reuse, value-at-risk", () => {
  const DAY = 86400;
  const NOW = 1_700_000_000;
  const firstSend = NOW - 30 * DAY; // exposed 30 days ago

  // history with: one outgoing tx (exposure), then an incoming tx 5 days later (reuse)
  const history = {
    async firstSentTxHash() {
      return "0xsent";
    },
    async sentTxHashes() {
      return ["0xsent"];
    },
    async transactions(): Promise<TxMeta[]> {
      return [
        { hash: "0xsent", from: wallet.address, to: "0xdead", timeStamp: firstSend, blockNumber: 1 },
        { hash: "0xrecv", from: "0xfeed", to: wallet.address, timeStamp: firstSend + 5 * DAY, blockNumber: 2 },
      ];
    },
  };

  it("computes harvest-age, reuse, and value-at-risk", async () => {
    const chains: AuditChain[] = [
      {
        name: "Eth",
        nativeSymbol: "ETH",
        nativeUsdPrice: 2000,
        history,
        provider: fakeProvider({
          getTransactionCount: async () => 1,
          getBalance: async () => 10n ** 18n, // 1 ETH
        }),
      },
    ];
    const r = await deepAudit(wallet.address, chains, { nowSeconds: NOW });

    expect(r.exposed).toBe(true);
    expect(r.firstExposure?.chain).toBe("Eth");
    expect(Math.round(r.firstExposure!.ageDays)).toBe(30);
    expect(r.reusedAfterExposure).toBe(true);
    expect(r.valueAtRisk.totalUsd).toBe(2000);
    expect(r.valueAtRisk.perChain[0]?.balanceFormatted).toBe("1.0");
  });
});
