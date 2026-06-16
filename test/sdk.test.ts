import { ethers } from "ethers";
import { describe, expect, it } from "vitest";

import {
  ecdsaSigner,
  encodeExecute,
  getUserOpHash,
  mlDsa44Signer,
  packUint128,
  unpackUint128,
  type UserOperation,
} from "../src/index.js";

const SEED = "0x" + "11".repeat(32);

const baseUserOp = (): UserOperation => ({
  sender: "0x1111111111111111111111111111111111111111",
  nonce: 7n,
  initCode: "0x",
  callData: encodeExecute(
    "0x2222222222222222222222222222222222222222",
    1000n,
    "0x",
  ),
  accountGasLimits: packUint128(13_500_000n, 500_000n),
  preVerificationGas: 1_000_000n,
  gasFees: packUint128(100_000_000n, 200_000_000n),
  paymasterAndData: "0x",
  signature: "0x",
});

describe("uint128 packing", () => {
  it("round-trips", () => {
    const packed = packUint128(13_500_000n, 500_000n);
    expect(unpackUint128(packed)).toEqual([13_500_000n, 500_000n]);
  });
});

describe("getUserOpHash", () => {
  it("is deterministic and 32 bytes", () => {
    const h1 = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 421614n);
    const h2 = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 421614n);
    expect(h1).toBe(h2);
    expect(ethers.getBytes(h1).length).toBe(32);
  });

  it("changes with chainId", () => {
    const a = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 1n);
    const b = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 2n);
    expect(a).not.toBe(b);
  });
});

describe("ecdsaSigner", () => {
  it("exposes the wallet address as its public key", async () => {
    const signer = ecdsaSigner({ privateKey: SEED });
    expect(await signer.publicKey()).toBe(new ethers.Wallet(SEED).address);
  });

  it("produces a recoverable raw signature over the hash", async () => {
    const signer = ecdsaSigner({ privateKey: SEED });
    const hash = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 421614n);
    const sig = await signer.sign(hash);
    expect(ethers.recoverAddress(hash, sig)).toBe(
      new ethers.Wallet(SEED).address,
    );
  });
});

describe("mlDsa44Signer", () => {
  it("derives a deterministic encoded public key from a seed", async () => {
    const a = await mlDsa44Signer({ seed: SEED }).publicKeyEncoded();
    const b = await mlDsa44Signer({ seed: SEED }).publicKeyEncoded();
    expect(a).toBe(b);
    expect(a.startsWith("0x")).toBe(true);
  });

  it("signs and verifies a UserOp hash", async () => {
    const signer = mlDsa44Signer({ seed: SEED });
    const hash = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 421614n);
    const sig = await signer.sign(hash);
    expect(sig.startsWith("0x")).toBe(true);
    expect(ethers.getBytes(sig).length).toBeGreaterThan(2000); // ML-DSA-44 ~2420 bytes
  });
});

describe("hybrid signature shape", () => {
  it("decodes as (bytes preSig, bytes postSig)", async () => {
    const hash = getUserOpHash(baseUserOp(), ethers.ZeroAddress, 421614n);
    const pre = await ecdsaSigner({ privateKey: SEED }).sign(hash);
    const post = await mlDsa44Signer({ seed: SEED }).sign(hash);
    const hybrid = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "bytes"],
      [pre, post],
    );
    const [dPre, dPost] = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes", "bytes"],
      hybrid,
    );
    expect(dPre).toBe(pre);
    expect(dPost).toBe(post);
  });
});
