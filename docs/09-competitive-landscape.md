# 09 — Competitive Landscape

> Sourced in [`10-research-references.md`](10-research-references.md). Facts vs. marketing
> claims are distinguished throughout.

## Executive read

The PQ-on-Ethereum space is early, research-heavy, and infrastructure-focused. As of
mid-2026 **no consumer-facing "migrate your wallet to quantum-safe" product has shipped at
scale.** The center of gravity is the **Ethereum Foundation's Kohaku project + ZKNOX** (i.e.
*this repo*), building the primitives. The official ethereum.org roadmap endorses **account
abstraction as the migration path**. That is exactly the wedge this tool sits on — and the
consumer funnel layer is unbuilt.

## Landscape

| Project / approach | What it is | Status | Chain | Fact vs claim |
| --- | --- | --- | --- | --- |
| **ZKNOX** | Solidity ML-DSA + Falcon verifiers, ERC-4337 PQ account | libs shipped; "20×"/HW claims unverified | EVM/Starknet | libs = fact |
| **Kohaku** (EF) | this repo — ETHFALCON in a 4337 account, SPHINCS+ research | active research | Ethereum | research |
| **ETHFALCON** | EVM-optimized Falcon-512 (keccak PRNG) + Epervier recovery | working + benchmarked | EVM | established |
| **EIP-8051 / 8052** | precompiles for ML-DSA / Falcon-512 | Draft (Oct 2025), needs EIP-7932 | L1 | proposal |
| **RIP-7212** | P256 precompile (not PQ, but the "add a curve" template) | live on Arbitrum/zkSync/OP | L2 | live |
| **EIP-8141** | AA mechanism for per-account "signature agility" | eyed for Hegotá fork, H2 2026 | L1 | proposal |
| **leanXMSS / leanSig** | hash-based validator sigs to replace BLS + zk aggregation | R&D, ~2029 target | consensus | aspiration |
| **QRL / Project Zond** | native XMSS chain; PoS+EVM+SPHINCS+ | Zond beta testnet | own L1 | most established PQ chain |
| **Algorand** | Falcon-secured state proofs live; account-level quantum toggle on 2026 roadmap | live (state proofs) | Algorand | live + roadmap |
| **Quantum Canary / Quantus** | read-only exposure scanners + "readiness score" | live | BTC/ETH | live but shallow |

## On-chain PQ verification cost (verified facts)

From the ETHFALCON repo and the Kohaku/ZKNOX ethresear.ch thread:

| Variant | Gas |
| --- | --- |
| Falcon-512 (NIST-compliant) | **~3.9M** |
| ETHFALCON (keccak instead of SHAKE) | **~1.5M** |
| Epervier (ecrecover-like recovery) | **~1.6M** |
| ML-DSA / Dilithium | **~6.6M** |
| SPHINCS+ "C13" (Kohaku, hash-based) | **~127k** (the "$0.07/account" claim) |

Why expensive: lattice schemes need NTT polynomial arithmetic + big hash-to-point ops, and
the EVM has no native opcodes for them. **Precompile endgame:** EIP-8052 targets **~3,000
gas** for Falcon. RIP-7212 (P256, ~100× cheaper, live on L2) proves the "ship a verifier as
an L2 precompile" path. **Implication:** ship L2-first; mainnet waits for precompiles.

## NIST signature standards (on-chain fit)

| Standard | Scheme | Status | On-chain fit |
| --- | --- | --- | --- |
| FIPS 204 | ML-DSA (Dilithium) | **Final** (Aug 2024) | balanced default; sig ~2.4KB. *This tool's default.* |
| FIPS 206 | FN-DSA (Falcon) | Draft | **smallest** sigs (~0.7KB); cheapest to verify on-chain |
| FIPS 205 | SLH-DSA (SPHINCS+) | Final | sigs 8–50KB — usually too large, but pure-hash & conservative |
| FIPS 203 | ML-KEM (Kyber) | Final | **KEM, not a signature** — not used for on-chain auth |

## Our differentiation (white space to own)

1. **The "scan → migrate" funnel as ONE product.** Scanners (Quantus, Quantum Canary)
   only diagnose; ZKNOX/Kohaku only ship primitives. Nobody owns scan → quantify in $ →
   one-click hybrid-account deploy → sweep. **This is the gap.**
2. **Hybrid-first.** Most projects treat PQ as either/or. A graceful **ECDSA ∧
   ML-DSA/Falcon** account matches the EF's own "signature agility" framing and is the
   pragmatic transition primitive — but no one packages it for consumers.
3. **An exposure scanner with teeth.** Existing ones produce a score and stop. We tie the
   scan to a remediation CTA and a migration receipt.
4. **Standards vacuum.** There is **no ERC for PQ accounts** yet (only AA + precompile
   drafts). A reference 4337 account + a proposed ERC for PQ-account capability discovery
   is ownable mindshare.
5. **L2-first honesty.** ERC-4337 bundler txs still need ECDSA until native AA
   (RIP-7560) lands; shipping on L2s (cheap gas, RIP-7212-style precompiles) is the
   realistic near-term path and a differentiator vs. anyone promising L1 PQ today.

## Reference to watch
**Algorand's** 2026 plan — a no-hard-fork, on-chain-vote "quantum-safe account" toggle — is
the closest analog to the AA-opt-in model and a useful design comparison.
