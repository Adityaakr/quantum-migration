# 01 — Threat Model

> Every factual claim here is sourced in [`10-research-references.md`](10-research-references.md).
> Numbers are modeled estimates, not exact on-chain measurements — stated as ranges.

## The cryptographic core

ECDSA over secp256k1 (Ethereum EOAs) rests on the hardness of the elliptic-curve
discrete-log problem: recovering private scalar `d` from public point `Q = dG`. **Shor's
algorithm solves this in polynomial time on a quantum computer.** An exposed public key
therefore fully determines the private key.

Hash functions are *not* broken by Shor — Grover gives only a quadratic speedup, which a
256-bit hash easily absorbs. This asymmetry is the whole game:

| On-chain artifact | What it reveals | Quantum status |
| --- | --- | --- |
| An address that has **only received** | `keccak256(pubkey)[12:]` (a hash) | **Safe** until first spend (preimage problem) |
| An address that has **sent ≥1 tx** | the full public key (via `ecrecover` on its signature) | **Exposed** — private key derivable by a CRQC |

### When exactly does exposure happen?

The moment an EOA sends **any** transaction. Ethereum nodes derive `tx.from` by
recovering the signing public key from `(r, s, v)` — there is no separate "from" field.
So the first outbound tx publishes the key permanently, regardless of value, success, or
whether it was a self-send. This is the inverse of Bitcoin's UTXO model (which can hide
the key until spend); Ethereum reuses one address for receiving and sending, so almost
every *active* EOA has already revealed its key.

**Practical consequence for us:** `eth_getTransactionCount(addr) > 0` ⟺ public key
exposed. That single RPC call is the scanner's fast path (see
[`03-exposure-scanner.md`](03-exposure-scanner.md)).

## Harvest now, decrypt later (HNDL)

The blockchain variant of HNDL is signature-specific: public keys already on-chain can
be **collected today and attacked whenever a CRQC arrives.** Because the chain is public,
permanent, and immutable, this exposure can never be retroactively encrypted or deleted —
the at-risk data is already irrevocably published. The only defense is to **move the
funds** to an address controlled by a quantum-safe key before the CRQC exists.

**Mosca's inequality (X + Y > Z):** if the time your assets must stay secure (X) plus the
time to migrate them (Y) exceeds the time until a CRQC (Z), you are already too late. A
migration tool directly shrinks Y.

## How much is exposed

- **Deloitte:** "over 65% of all Ether are vulnerable to a quantum attack," defined as
  coins in addresses whose public key is already published. Higher than Bitcoin's ~25%
  because of Ethereum's address reuse.
- **Academic ("Quantum Horizon," 2026):** ~50–65% of ETH in key-revealed accounts
  (most defensibly 55–60%), with a noted Beacon-deposit-contract correction.
- **Do NOT conflate with the EF's ~0.1% figure** — that measures *dormant/unrecoverable*
  ETH (owners who couldn't react to an emergency hard fork), a different question. This
  is the single most common error in the topic. We lead with "exposed public key,"
  clearly defined.

## The timeline (genuinely uncertain — always show a range)

- **Global Risk Institute 2025 expert survey:** highest-ever estimate — ~28–49% chance of
  breaking RSA-2048 within 10 years; ~69% within 15 years.
- **Hardware:** Google "Willow" (Dec 2024) demonstrated below-threshold error correction;
  IBM *targets* fault-tolerant "Starling" by 2029 (a target, not an achievement).
- **Algorithmic:** Gidney (2025) estimates RSA-2048 in <1 week with <1M noisy qubits —
  ~20× fewer than his 2019 figure, but still ~1000× more qubits than today's best chips.
- **Government:** NIST IR 8547 roadmap — deprecate ECC P-256 by 2030, disallow by 2035.
- **Skeptics** (Dyakonov, Kalai) argue scaling may stall for decades.
- **Demonstrated capability:** Project Eleven's Q-Day Prize (Apr 2026) broke a **15-bit**
  EC key — a milestone, but vastly short of the 256-bit keys in use.

**Honest framing for the product:** the median expert estimate is tightening toward
~2030–2035, the tails are heavy both ways, and the data points keep moving *earlier*. We
never claim a date; we frame it as risk management under uncertainty (Mosca).

## What we migrate *to*

A hybrid account whose every UserOperation requires **two** valid signatures:
- **Pre-quantum:** ECDSA secp256k1 (or P256) — works with today's infra.
- **Post-quantum:** ML-DSA-44 (FIPS 204, finalized Aug 2024) or Falcon/ETHFALCON.

The hybrid AND-gate means: even if the ECDSA key is later quantum-broken, an attacker
still cannot move funds without the ML-DSA key. And today, if the (newer, less-audited)
PQ verifier had a bug, the ECDSA half still protects you. Graceful degradation in both
directions. NIST signature options and their on-chain fit are summarized in
[`09-competitive-landscape.md`](09-competitive-landscape.md) and
[`06-contracts.md`](06-contracts.md).
