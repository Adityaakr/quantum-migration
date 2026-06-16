# 02 — Architecture

End-to-end system for **scan → quantify → migrate**. Everything client-side where
possible (keys never leave the browser); third-party services are read-only data
providers + the bundler.

## High-level diagram

```
┌──────────────────────────── Browser (React app) ────────────────────────────┐
│                                                                              │
│  Wallet (MetaMask/Rabby)            @kohaku-eth/pq-account  (the SDK)         │
│        │  signs sweeps                    │                                   │
│        ▼                                  ▼                                   │
│  ┌───────────┐   ┌────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │  Scanner  │──▶│  Risk/USD  │──▶│  Migrator    │──▶│ PQAccount + signers │  │
│  │  module   │   │  valuation │   │  (sweep+pq)  │   │ (ECDSA + ML-DSA-44) │  │
│  └─────┬─────┘   └─────┬──────┘   └──────┬───────┘   └─────────┬──────────┘  │
└────────┼───────────────┼─────────────────┼──────────────────────┼──────────┘
         │ RPC           │ prices           │ legacy EOA txs        │ UserOps
         ▼               ▼                  ▼                       ▼
   ┌──────────┐   ┌─────────────┐   ┌──────────────┐      ┌──────────────────┐
   │ JSON-RPC │   │ price feed  │   │  Ethereum    │      │ Pimlico bundler  │
   │ +indexer │   │ (CoinGecko) │   │  (sweep txs) │      │ + paymaster      │
   │(Alchemy/ │   └─────────────┘   └──────────────┘      └────────┬─────────┘
   │ Etherscan)│                                                   ▼
   └──────────┘                                          EntryPoint v0.7 →
                                                         ZKNOX hybrid account
```

## The three modules

### 1. Scanner (read-only)
- **Input:** an address (typed or wallet-connected; resolve ENS first).
- **Fast path:** `eth_getCode` (EOA vs contract vs 7702-delegated) + `eth_getTransactionCount`
  (nonce > 0 ⟹ exposed).
- **Artifact path (for display):** find the first outgoing tx (indexer), recover the
  public key from its signature (ethers v6 `Transaction.from(...).fromPublicKey`).
- **Output:** `{ level, pubkey?, firstTxHash?, reused }`.
- Full design: [`03-exposure-scanner.md`](03-exposure-scanner.md).

### 2. Valuation (read-only)
- Native balance + ERC-20 balances (token list per chain; reuse
  `examples/pq-account/src/config/tokens.ts`).
- Price each via a price feed (CoinGecko/DefiLlama) → USD at risk.
- Drives the HIGH_RISK threshold and the headline number in the UI.

### 3. Migrator (writes)
- **Deploy** the hybrid account via the existing CREATE2 factory
  (`deployments.json`). Address is deterministic from `(preQuantumPubKey,
  postQuantumPubKey)` — known before deploy.
- **Sweep** from the legacy EOA: ERC-20 `transfer`s first, then NFTs, then the ETH
  remainder last (with a gas reserve). The EOA still controls these — normal signed txs.
- **Verify & retire:** confirm balances landed; mark the EOA retired in the UI.
- Optional: after sweep, the new account operates via Pimlico UserOps (hybrid-signed).
- Full design: [`04-migration-flow.md`](04-migration-flow.md).

## Data providers (all swappable, read-only except bundler)

| Concern | Primary | Fallback | Notes |
| --- | --- | --- | --- |
| RPC | Alchemy | public RPC | nonce, code, balances, tx fetch |
| First-sent-tx lookup | `alchemy_getAssetTransfers` | Etherscan `txlist` | ascending, `maxCount=1` |
| Prices | CoinGecko | DefiLlama | USD valuation |
| Bundler | Pimlico (Alto) | any ERC-4337 bundler | UserOp submission |
| Paymaster | Pimlico singleton | — | gasless deploy/op (fast-follow) |

## Trust & security boundaries

- **Keys never leave the browser.** ECDSA via the connected wallet; ML-DSA-44 derived
  in-browser via `@noble/post-quantum`. The current example takes raw seed strings in a
  textbox — **the migration tool must replace that** with wallet-signing + a proper PQ
  key source (passkey-derived or encrypted local store). See
  [`05-sdk-design.md`](05-sdk-design.md) §"PQSigner".
- **Indexers/price feeds are read-only** — a compromised one can mislead the *display*
  but cannot move funds (all writes are user-signed).
- **The bundler cannot forge** — it only relays UserOps that already carry valid hybrid
  signatures; the on-chain account rejects anything else.

## Chain strategy

Arbitrum Sepolia first (PQ verification is millions of gas — see
[`09-competitive-landscape.md`](09-competitive-landscape.md); L2 gas makes it viable),
then Sepolia, then mainnet only once verification cost / precompiles make it sane.
