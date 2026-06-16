# Quantum Migration Tool (working name: **Aegis-PQ**)

> Scan any Ethereum address for quantum exposure, quantify the risk in dollars, then
> migrate funds into a hybrid post-quantum ERC-4337 account
> (ECDSA **AND** ML-DSA / Falcon).

**This folder is self-contained.** It holds the plan (`docs/`), the working SDK
(`src/`), tests, and a runnable demo. It installs, builds, and runs on its own — it does
not depend on the rest of the repo. (The SDK was originally extracted from
[`../packages/pq-account`](../packages/pq-account) and the
[`../examples/pq-account`](../examples/pq-account) reference app, then consolidated here.)

## The one-sentence pitch

Every Ethereum address that has ever **sent** a transaction has already published the
public key a quantum computer needs to steal it ("harvest now, decrypt later"). This
tool finds those exposed addresses, scores the risk, and gives users a one-click path
off them and onto a quantum-safe account.

## Quick start

```bash
cd quantum-migration
pnpm install        # or: npm install   (standalone — no monorepo needed)
pnpm test           # 15 unit tests (offline)
pnpm demo           # SDK demo: derive keys, hybrid-sign a UserOp (no RPC)
pnpm demo:scan      # scanner demo: UNEXPOSED / EXPOSED / CONTRACT verdicts (no RPC)
pnpm build          # tsup → dist/ (ESM + .d.ts)
pnpm typecheck      # tsc --noEmit
```

`pnpm demo` prints the derived ECDSA address, the ~22 KB expanded ML-DSA public key, a
hybrid-signed UserOperation, and verifies the ECDSA half recovers. `pnpm demo:scan`
shows the exposure scanner classifying addresses (set `QM_RPC_URL` + `QM_ADDRESS` to scan
a real address on a live RPC) — all with no network by default.

## What's here

```
quantum-migration/
├── README.md              ← you are here
├── package.json           Standalone project (ethers + noble are direct deps)
├── tsconfig.json          Self-contained (no monorepo extends)
├── tsup.config.ts
├── docs/                  THE PLAN — read these to understand everything
│   ├── 00-overview.md          problem, product, scope
│   ├── 01-threat-model.md      quantum threat, exposure model (cited)
│   ├── 02-architecture.md      end-to-end system
│   ├── 03-exposure-scanner.md  detect & score exposed addresses
│   ├── 04-migration-flow.md    deploy + sweep; why NOT EIP-7702
│   ├── 05-sdk-design.md        the SDK in src/ (this code)
│   ├── 06-contracts.md         required contract changes
│   ├── 07-tech-stack.md        stack & infra
│   ├── 08-roadmap.md           milestones & build order
│   ├── 09-competitive-landscape.md
│   └── 10-research-references.md  primary sources for every claim
├── src/                   THE CODE — Milestones 0 & 1 ✅
│   ├── index.ts                public API
│   ├── account.ts              PQAccount: address / deploy / send / sendBatch / waitForUserOp
│   ├── core/userOperation.ts   UserOp build, v0.7 hash, packing, execute encoding
│   ├── signers/                ecdsaSigner, mlDsa44Signer (pluggable)
│   ├── bundler/client.ts       BundlerClient + waitForUserOp (Pimlico-compatible)
│   ├── encoding/mldsa.ts       ML-DSA pubkey expansion (matches on-chain verifier)
│   ├── scanner/                ExposureScanner: scan → verdict + recovered pubkey + score
│   ├── audit/                  deepAudit: multi-chain + cryptographic proof + nonce-reuse
│   ├── migrate/                sweepFrom: deploy + sweep (tokens first, ETH last)
│   └── deployments.ts          typed ZKNOX factory/verifier addresses
├── test/                  32 offline tests (sdk + scanner + audit + sweep)
├── demo/                  runnable demos (address, scan, testnet, audit)
└── app/                   React + Vite frontend: connect → scan → audit → deploy → sweep
```

## Using the SDK

```ts
import { JsonRpcProvider } from "ethers";
import { PQAccount, ecdsaSigner, mlDsa44Signer, pimlico } from "quantum-migration";

const provider = new JsonRpcProvider(RPC_URL);

const account = await PQAccount.create({
  preQuantum:  ecdsaSigner({ privateKey: "0x…" }),
  postQuantum: mlDsa44Signer({ seed: "0x…" }),
  provider,
  bundler: pimlico(BUNDLER_URL),
});

await account.getAddress();          // deterministic CREATE2 address (pre-deploy)
await account.deploy(fundingSigner); // factory tx
const hash = await account.send({ to, value, data });   // build + hybrid-sign + submit
await account.waitForUserOp(hash);   // poll for inclusion
```

## Run the app

```bash
cd quantum-migration/app
pnpm install
pnpm dev      # open the printed localhost URL
# connect a wallet on Sepolia / Arbitrum Sepolia → scan → generate keys → deploy → sweep
```

## Status

- ✅ **Milestone 0** — SDK engine (`src/`): `PQAccount`, signers, bundler, encoding.
- ✅ **Milestone 1** — exposure scanner (`src/scanner/`): scan → verdict + recovered key.
- ✅ **Deep audit** (`src/audit/`): multi-chain scan + cryptographic exposure proof
  (key-consistency + address-binding) + ECDSA nonce-reuse detection. `pnpm demo:audit`.
- ✅ **Milestone 2** — migration (`src/migrate/`): deploy + sweep (tokens first, ETH last).
- ✅ **App** (`app/`) — React scan→migrate UI, builds standalone.
- ⬜ **Next** — gasless onboarding (paymaster), passkey key sourcing, NFT sweep,
  Falcon/P256 signers. See [`docs/08-roadmap.md`](docs/08-roadmap.md).

### The end-to-end flow (all working)
`scan(address)` → if **EXPOSED**, generate a hybrid keypair → `deploy()` the
post-quantum account → `sweepFrom(legacyWallet)` moves ETH + ERC-20s into it → the old
exposed address is retired.

Full build order: [`docs/08-roadmap.md`](docs/08-roadmap.md). The frontend app will be
added under this folder (e.g. `app/`) so everything stays in one place.
