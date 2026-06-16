# 08 — Roadmap

Build order is chosen so each milestone is independently demoable and each de-risks the
next. Effort markers are rough (S = ~1 day, M = ~2–4 days, L = ~1 week+).

## Milestone 0 — SDK extraction (foundation) · **M** · ✅ DONE
Got the proven logic out of the example into this folder's `src/` (self-contained), with
no behavior change. Builds, typechecks, and 8/8 tests pass standalone.
- [x] Move `core/` (UserOp build, `getUserOpHash`, packing) + `signers/ecdsa` +
      `signers/mldsa` + `encoding/` into `src/`.
- [x] `PQAccount.create()/.getAddress()/.deploy()/.send()/.sendBatch()`.
- [x] Add `waitForUserOp()` (`eth_getUserOperationReceipt` poll) — fixes a known gap.
- [x] Offline tests + runnable `demo/` proving it works.
- [ ] (Optional) Refactor `examples/pq-account` to consume this SDK — deferred; this
      folder is now the canonical home.
- **Exit:** ✅ SDK installs/builds/tests on its own (`pnpm test`, `pnpm demo`).

## Milestone 1 — Exposure scanner · **M** · ✅ DONE (lib)
The product's front door; read-only, no money at risk. In `src/scanner/`.
- [x] `ExposureScanner.scan(addr)`: ENS resolve → `eth_getCode` → `eth_getTransactionCount`.
- [x] First-sent-tx lookup — pluggable `TxHistorySource` (Alchemy + Etherscan sources).
- [x] Public-key recovery (`Transaction.from().fromPublicKey`) + address verification.
- [x] USD valuation — pluggable `ValuationSource` (price-feed impl is a UI-layer concern).
- [x] Risk scoring (UNEXPOSED / EXPOSED / HIGH_RISK / CONTRACT) + 7702 / contract edge cases.
- [x] 7 offline tests + `demo/scan.ts` (works offline; `QM_RPC_URL` for live scans).
- [ ] UI: verdict badge, USD at risk, explainer, recovered key, CTA — comes with the app.
- **Exit:** ✅ `scanner.scan(addr)` returns correct verdict + recovered key. `pnpm demo:scan`.

## Milestone 2 — Migration (deploy + sweep) · **L** · ✅ DONE (lib + app)
The payoff. In `src/migrate/` + the `app/` UI.
- [x] `PQAccount.sweepFrom(legacyEoa, …)`: ERC-20s first, ETH last with gas reserve.
- [x] `computeEthSweepValue` (pure, tested) + pluggable `SweepExecutor` (6 tests).
- [x] Deploy hybrid account via factory; deterministic address shown pre-deploy.
- [x] Per-asset failure isolation (one bad token doesn't abort the rest).
- [ ] PQ key sourcing via passkey/keystore — app currently generates + shows seeds (MVP).
- [ ] ERC-721/1155 receiver hooks on the account (contract change — see 06-contracts.md).
- **Exit:** ✅ scan → generate keys → deploy → sweep, end to end in the `app/` UI.

## App — scan→migrate frontend · ✅ DONE (MVP)
React + Vite app in [`app/`](../app). Connect wallet → scan → generate PQ keys → deploy →
sweep. Builds standalone (`cd app && pnpm install && pnpm build`). Imports the SDK directly
from `../src`. Testnet only (Sepolia / Arbitrum Sepolia).

## Milestone 3 — Gasless onboarding · **M**
- [ ] Pimlico verifying paymaster preset in the SDK.
- [ ] Deploy-via-UserOp (`factory`/`factoryData`) so a fresh account needs no ETH.
- [ ] Re-sign hybrid signature after attaching paymaster (known gap).
- **Exit:** a user with tokens but no ETH can still migrate.

## Milestone 4 — Polish & breadth · **M**
- [ ] NFT sweep UX (enumerate owned ids via indexer/logs).
- [ ] Multi-scheme: `falconSigner` + `p256Signer` (verifiers already deployed).
- [ ] Migration "receipt" (shareable proof of migration).
- [ ] Sepolia support; portfolio/batch scan.

## Stretch — follow-on products (separate specs)
- **Graduated-security policy** account (PQ only above a threshold) — cheaper daily use.
- **Quantum Recovery Vault** — PQ as break-glass recovery, not co-required every tx.
- **DAO/treasury PQ vault** — biggest harvest-now target.
- **PQ-verify gas leaderboard** — public good, top-of-funnel for the SDK.

## Decisions
1. **App placement:** ✅ decided — the frontend goes under `quantum-migration/app/` so the
   whole project stays self-contained and portable.
2. **Confirm chain order:** Arbitrum Sepolia → Sepolia. (Recommended.)

## Next up
Milestone 1 — the exposure scanner (`src/scanner/`), the product front door. Read-only,
no funds at risk, builds directly on the SDK that's already here.
