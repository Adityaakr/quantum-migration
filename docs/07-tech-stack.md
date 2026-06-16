# 07 — Tech Stack

Reuse the example app's stack so the migration tool drops into the monorepo cleanly.

## Frontend
- **React 19 + Vite 7 + TypeScript** (matches `examples/pq-account`).
- **wagmi 3 + viem 2** for wallet connection & chain config.
- **ethers v6** for tx construction, public-key recovery, and sweeps (the recovery API
  `Transaction.from().fromPublicKey` is cleanest in ethers).
- **TanStack Router + Query** for routing & async state (already used).
- **Tailwind 4 + tailwind-variants** for UI (already used).

> Note the app mixes ethers and viem/wagmi. Keep that boundary: wagmi for
> connection/chain, ethers for signing/recovery/UserOps (the existing code does this).

## Crypto
- **`@noble/post-quantum`** — ML-DSA-44 (and Falcon if added) keygen/sign in-browser.
- **`@noble/hashes`** — keccak/shake for the MLDSA pubkey expansion.

## On-chain / infra
- **EntryPoint v0.7** `0x0000000071727De22E5E9d8BAf0edAc6f37da032`.
- **Pimlico** bundler (Alto) + singleton paymaster (gasless, fast-follow).
- **ZKNOX factories + verifiers** — addresses already in
  [`packages/pq-account/deployments/deployments.json`](../../packages/pq-account/deployments/deployments.json).

## Data providers
- **RPC:** Alchemy (primary) + a public fallback — nonce, code, balances, tx fetch.
- **First-sent-tx / transfers:** `alchemy_getAssetTransfers` (primary), Etherscan
  `txlist` (fallback).
- **Prices:** CoinGecko (primary), DefiLlama (fallback) — USD valuation.
- **Token lists:** reuse `examples/pq-account/src/config/tokens.ts`.

## SDK
- The SDK in this folder's **`src/`** (package name `quantum-migration`; see
  [`05-sdk-design.md`](05-sdk-design.md)). The app depends on it; no logic duplicated in
  the app.

## Contracts / dev
- **Foundry** (already configured: `foundry.toml`, `makefile`, tests).
- **Python signer** used inside Solidity tests (Falcon keygen) — see package README.
- **pnpm workspaces + changesets** (monorepo standard).

## Environment / secrets
- Alchemy + Etherscan + CoinGecko API keys, Pimlico API key.
- Follow the repo convention: `.env` from `.env.sample`, or sops via the nix devshell
  (root README).

## Layout (self-contained)
Everything lives inside this folder so it works on its own:
```
quantum-migration/
├── docs/        # the plan
├── src/         # the SDK (engine)  ✅
├── test/ demo/  # offline tests + demo
└── app/         # the scan→migrate frontend (Milestone 1+, to be added here)
```
The React app will be added under `quantum-migration/app/` and consume the SDK from
`../src` (or the built `dist/`). Keeping the app here — rather than as tabs in
`examples/pq-account` — keeps the whole project portable and brandable in one place.
