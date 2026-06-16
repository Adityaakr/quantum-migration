import { computeAddress, Transaction, Wallet } from "ethers";
import { describe, expect, it } from "vitest";

import { ExposureScanner, recoverPublicKeyFromResponse } from "../src/index.js";

const KEY = "0x" + "33".repeat(32);
const wallet = new Wallet(KEY);

/** Minimal fake Provider exposing only the methods ExposureScanner calls. */
const fakeProvider = (overrides: Record<string, unknown>) =>
  ({
    getCode: async () => "0x",
    getTransactionCount: async () => 0,
    resolveName: async (n: string) => null,
    getTransaction: async () => null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

// Build a real signed type-2 tx so the recovery path has genuine signature data.
async function signedTxResponse() {
  const raw = await wallet.signTransaction({
    type: 2,
    chainId: 421614n,
    nonce: 0,
    to: "0x2222222222222222222222222222222222222222",
    value: 1n,
    gasLimit: 21000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    data: "0x",
  });
  return Transaction.from(raw); // has type, chainId, signature, from, etc.
}

describe("ExposureScanner", () => {
  it("classifies a never-sent EOA as UNEXPOSED", async () => {
    const scanner = new ExposureScanner({
      provider: fakeProvider({ getTransactionCount: async () => 0 }),
    });
    const r = await scanner.scan(wallet.address);
    expect(r.level).toBe("UNEXPOSED");
    expect(r.score).toBe(0);
    expect(r.publicKey).toBeUndefined();
  });

  it("classifies a contract as CONTRACT", async () => {
    const scanner = new ExposureScanner({
      provider: fakeProvider({ getCode: async () => "0x60806040" }),
    });
    const r = await scanner.scan(wallet.address);
    expect(r.level).toBe("CONTRACT");
    expect(r.isContract).toBe(true);
  });

  it("classifies a sent EOA as EXPOSED and recovers its public key", async () => {
    const tx = await signedTxResponse();
    const scanner = new ExposureScanner({
      provider: fakeProvider({
        getTransactionCount: async () => 5,
        getTransaction: async () => tx,
      }),
      history: { firstSentTxHash: async () => "0xdead" },
    });
    const r = await scanner.scan(wallet.address);
    expect(r.level).toBe("EXPOSED");
    expect(r.nonce).toBe(5);
    expect(r.firstSentTxHash).toBe("0xdead");
    // recovered pubkey must derive back to the signer's address
    expect(computeAddress(r.publicKey!)).toBe(wallet.address);
  });

  it("flags an EIP-7702 delegated EOA as exposed even with nonce 0", async () => {
    const scanner = new ExposureScanner({
      provider: fakeProvider({
        getCode: async () =>
          "0xef0100" + "00".repeat(20),
        getTransactionCount: async () => 0,
      }),
    });
    const r = await scanner.scan(wallet.address);
    expect(r.isDelegated).toBe(true);
    expect(r.level).toBe("EXPOSED");
  });

  it("escalates to HIGH_RISK when value exceeds the threshold", async () => {
    const scanner = new ExposureScanner({
      provider: fakeProvider({ getTransactionCount: async () => 1 }),
      valuation: { valueUsd: async () => 50_000 },
      highValueThresholdUsd: 1000,
    });
    const r = await scanner.scan(wallet.address);
    expect(r.level).toBe("HIGH_RISK");
    expect(r.valueUsd).toBe(50_000);
    expect(r.score).toBeGreaterThan(80);
  });

  it("resolves ENS names via the provider", async () => {
    const scanner = new ExposureScanner({
      provider: fakeProvider({
        resolveName: async () => wallet.address,
        getTransactionCount: async () => 0,
      }),
    });
    const r = await scanner.scan("someone.eth");
    expect(r.address).toBe(wallet.address);
  });
});

describe("recoverPublicKeyFromResponse", () => {
  it("recovers the signer's public key from a signed tx", async () => {
    const tx = await signedTxResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubkey = recoverPublicKeyFromResponse(tx as any);
    expect(computeAddress(pubkey)).toBe(wallet.address);
  });
});
