# 05 — SDK Design (`@kohaku-eth/pq-account`)

The north star: the migration logic must live in a **reusable library**, with the example
app and the migration tool both as consumers. Today the logic is trapped in
`examples/pq-account/src/utils/*` — coupled to React, to `log()` callbacks, to raw seed
strings, and to a single hardcoded scheme (ML-DSA-44).

## What the SDK fixes

| Today (in the example) | SDK |
| --- | --- |
| `signUserOpHybrid(...)` lives in app `utils/` | published package, importable anywhere |
| ML-DSA-44 hardcoded everywhere | pluggable signer per scheme (MLDSA, MLDSAETH, Falcon, ETHFALCON) |
| keys are raw `0x…` seed strings in fn args | `PQSigner` abstraction (seed / passkey / keystore) |
| `log: (msg)=>void` threaded through every fn | returns values / emits events; no UI coupling |
| hand-rolled `fetch` to Pimlico JSON-RPC | thin `BundlerClient` (any ERC-4337 bundler) |
| MLDSA pubkey packing buried in app | `encodePublicKey(scheme, key)` exported |
| no receipt polling | `waitForUserOp()` built in |

## Public surface

```ts
import {
  PQAccount, ecdsaSigner, p256Signer,
  mlDsa44Signer, falconSigner,
  pimlico, ExposureScanner,
} from "@kohaku-eth/pq-account";

// ── Scan (read-only) ───────────────────────────────────────────────
const scanner = new ExposureScanner({ rpc, indexer });
const report = await scanner.scan(address);
// → { level: "EXPOSED", pubkey, valueUSD, reused, firstTxHash }

// ── Build / address (deterministic, pre-deploy) ────────────────────
const account = await PQAccount.create({
  preQuantum:  ecdsaSigner({ wallet }),         // or p256Signer / passkey
  postQuantum: mlDsa44Signer({ seed }),         // or falconSigner(...)
  chain: arbitrumSepolia,
  bundler: pimlico(url),
});
account.address;                                 // CREATE2 address before deploy

// ── Migrate ────────────────────────────────────────────────────────
await account.deploy();                          // factory tx (or gasless via paymaster)
await account.sweepFrom(legacyEoaSigner, {       // tokens first, ETH last, gas reserve
  tokens: ["0x…"], nfts: [{ addr, id }], sweepEth: true,
});

// ── Operate ────────────────────────────────────────────────────────
const hash = await account.send({ to, value, data });   // build + hybrid-sign + submit
await account.waitForUserOp(hash);               // poll eth_getUserOperationReceipt
await account.sendBatch([op1, op2]);             // executeBatch (already in the ABI)
```

## Package layout

The SDK lives **inside this self-contained `quantum-migration/` folder** (`src/`), so the
whole project — docs, engine, and (later) the app — installs and runs on its own.

```
quantum-migration/
├── docs/                     # the plan (incl. this file)
├── src/                      # the SDK  ✅ Milestone 0
│   ├── index.ts              # public API
│   ├── core/                 # UserOp build, getUserOpHash, packUint128  (from userOperation.ts)
│   ├── signers/              # ecdsa.ts, mldsa.ts (+ p256/falcon later)  (pluggable PQSigner)
│   ├── encoding/             # MLDSA pubkey expansion  (from utils_mldsa.ts)
│   ├── bundler/              # JSON-RPC client + pimlico preset + waitForUserOp
│   ├── scanner/              # ExposureScanner  (Milestone 1 — from 03-exposure-scanner.md)
│   ├── account.ts            # PQAccount: address / deploy / sweepFrom / send / sendBatch
│   └── deployments.ts        # typed ZKNOX factory/verifier addresses
├── test/ · demo/             # offline tests + runnable demo
└── package.json              # standalone (ethers + noble direct deps)
```

The source was extracted from `examples/pq-account/src/utils/*` and the addresses mirror
`packages/pq-account/deployments/deployments.json`, then copied here so this folder is the
single source of truth and works independently.

## The `PQSigner` abstraction (the key upgrade)

The example's biggest liability is raw seed strings in the UI. The SDK defines:

```ts
interface PQSigner {
  scheme: "ml-dsa-44" | "falcon-512" | "ethfalcon" | ...;
  publicKeyEncoded(): Promise<Uint8Array>;   // expanded/ABI-encoded for on-chain
  sign(userOpHash: Uint8Array): Promise<Uint8Array>;
}
interface PreQuantumSigner {                  // ECDSA / P256
  publicKey(): Promise<string>;
  sign(userOpHash: Uint8Array): Promise<string>;
}
```

Concrete signers:
- `mlDsa44Signer({ seed })` — deterministic from a 32-byte seed (current behavior).
- `mlDsa44Signer({ passkey })` — derive the seed from a WebAuthn credential (no seed to
  store; recoverable). **Recommended for the migration tool.**
- `ecdsaSigner({ wallet })` — reuse the connected wallet; signatures via the provider.

This makes "how is the key stored/derived" a pluggable concern instead of a textbox.

## Hybrid signing (preserve the proven logic)

The core scheme is already correct and must be carried over verbatim into `core/`:

```ts
// sign the SAME v0.7 userOpHash with BOTH algorithms, then abi.encode(["bytes","bytes"])
const pre  = await preQuantum.sign(userOpHash);   // ECDSA
const post = await postQuantum.sign(userOpHash);  // ML-DSA-44
return AbiCoder.defaultAbiCoder().encode(["bytes", "bytes"], [pre, post]);
```

The on-chain account decodes `(bytes, bytes)` and verifies each half independently
(`ZKNOX_ERC4337_account.isValid`). Do not alter the hash construction (v0.7).

## Migration order: extract, don't rewrite

1. **Move** `core/` + `signers/ecdsa` + `signers/mldsa` + `encoding/` out of the example
   verbatim (no behavior change) → green `PQAccount.send()` on Arbitrum Sepolia.
2. **Refactor** the example's `sendTransaction.ts` / `aaveHelpers.ts` to call the SDK →
   delete the duplication (proves reusability).
3. **Add** `ExposureScanner`, `sweepFrom`, `waitForUserOp`, paymaster preset.
4. **Add** `falconSigner` + `p256Signer` (verifiers already deployed) → multi-scheme.
