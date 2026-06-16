# 00 — Overview

## The problem

On Ethereum, an account's address is `keccak256(pubkey)[12:]` — a hash of the public
key. The public key itself stays hidden **until the account sends its first
transaction**, at which point the ECDSA signature reveals it permanently (anyone can
recover it via `ecrecover`). A future quantum computer running Shor's algorithm can
derive the private key from that exposed public key.

Because addresses are reused, **the majority of circulating ETH sits at addresses whose
public key is already exposed** (Deloitte: "over 65% of all Ether"; see
[`01-threat-model.md`](01-threat-model.md)). Adversaries can record those keys today and
crack them the day a cryptographically-relevant quantum computer (CRQC) exists —
"harvest now, decrypt later." The funds cannot be un-exposed: the chain is permanent.

The only user-level remedy that exists today is **account abstraction** — move funds to
an account whose spending authority requires a post-quantum signature the quantum
computer cannot forge. That is precisely what the [`pq-account`](../../packages/pq-account)
hybrid account does. What's missing is a product that makes a normal user *find out
they're exposed* and *act on it*.

## The product

A web app (+ reusable SDK) with three steps:

1. **Scan.** Paste/connect an address. Determine whether its secp256k1 public key has
   been revealed on-chain and quantify the value at risk in USD.
   → [`03-exposure-scanner.md`](03-exposure-scanner.md)
2. **Quantify.** Show a clear risk verdict (UNEXPOSED / EXPOSED / HIGH RISK), the dollar
   amount exposed, and an explanation a non-cryptographer understands.
3. **Migrate.** Deploy a hybrid post-quantum ERC-4337 account at a fresh deterministic
   address and sweep ETH + ERC-20s (+ NFTs) into it, then retire the old EOA.
   → [`04-migration-flow.md`](04-migration-flow.md)

All three steps are powered by a single library, `@kohaku-eth/pq-account`, extracted
from the logic currently trapped in the example app.
→ [`05-sdk-design.md`](05-sdk-design.md)

## Scope (what is and isn't in v1)

**In scope (MVP):**
- Exposure scanner for a single EOA (nonce-based fast path + pubkey recovery for display).
- USD valuation of native + ERC-20 holdings.
- One-click deploy of an ML-DSA-44 + ECDSA hybrid account (reusing the deployed
  factories in `deployments.json`).
- Sweep flow (tokens first, ETH last) with the legacy EOA still signing.
- Arbitrum Sepolia first (cheap PQ verification gas), then Sepolia.

**Out of scope (v1):**
- In-place EIP-7702 migration (keeps the exposed key — disqualifying; see
  [`04-migration-flow.md`](04-migration-flow.md) §"Why not 7702").
- Mainnet (PQ verification gas is large; ship testnet + L2 first).
- Multi-sig / Safe migration, batch/portfolio scanning, NFT-heavy sweeps (fast-follow).
- A custom bundler/paymaster (use Pimlico).

## Naming

Working codename **Aegis-PQ** ("aegis" = shield). Alternatives to consider: *Kohaku
Shield*, *Quantum Leap*, *QSweep*, *PostQ*. The repo/brand context is Kohaku + ZKNOX, so
final naming should defer to the maintainers. Docs use "the tool" / "Aegis-PQ"
interchangeably.

## Success criteria

- A user can go from "paste address" to "funds in a quantum-safe account" in < 5 minutes
  on Arbitrum Sepolia.
- The scanner correctly classifies exposed vs. unexposed with one RPC call (nonce) and
  recovers the actual public key for display.
- The migration logic lives in the SDK, and the example app is refactored to consume it
  (proving reusability — the stated north star).
