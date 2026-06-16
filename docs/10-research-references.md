# 10 — Research References

Primary sources behind the claims in these docs (research conducted June 2026). Numbers
are modeled estimates unless stated; always present timelines as ranges.

## Threat model & exposure
- Quantum Horizon (2026) — qubit estimates, ETH exposure model — https://arxiv.org/abs/2606.14484
- Roetteler et al., ASIACRYPT 2017 — 2,330-logical-qubit formula for secp256k1 — https://arxiv.org/abs/1706.06752
- Ethereum.org — Quantum resistance roadmap (pubkey exposed on first send; 4 sensitive components) — https://ethereum.org/roadmap/future-proofing/quantum-resistance/
- pq.ethereum.org — EF post-quantum effort, ~2029 L1 target, Lean Ethereum — https://pq.ethereum.org/
- Deloitte — Quantum risk to Ethereum ("over 65% of Ether vulnerable") — https://www.deloitte.com/nl/en/services/consulting-risk/perspectives/quantum-risk-to-the-ethereum-blockchain.html
- Deloitte — Quantum & the Bitcoin blockchain (~25% baseline) — https://www.deloitte.com/nl/en/services/consulting-risk/perspectives/quantum-computers-and-the-bitcoin-blockchain.html
- Harvest now, decrypt later — https://en.wikipedia.org/wiki/Harvest_now,_decrypt_later
- Mosca's inequality (X+Y>Z) — https://postquantum.com/post-quantum/moscas-theorem/

## Timeline
- Global Risk Institute 2025 quantum threat timeline (analysis) — https://postquantum.com/security-pqc/quantum-threat-timeline-report-2025/
- NIST IR 8547 (deprecate ECC by 2030 / disallow 2035) — https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf
- NSA CNSA 2.0 — https://media.defense.gov/2025/May/30/2003728741/-1/-1/0/CSA_CNSA_2.0_ALGORITHMS.PDF
- Google Willow (below-threshold error correction), Nature 2024 — https://www.nature.com/articles/s41586-024-08449-y
- Gidney 2025 — RSA-2048 with <1M noisy qubits — https://arxiv.org/abs/2505.15917
- IEEE Spectrum — "The Case Against Quantum Computing" (skeptic) — https://spectrum.ieee.org/the-case-against-quantum-computing
- Project Eleven Q-Day Prize (15-bit EC key broken, Apr 2026) — https://www.prnewswire.com/news-releases/project-eleven-awards-1-btc-q-day-prize-for-largest-quantum-attack-on-elliptic-curve-cryptography-to-date-302752439.html

## NIST PQC standards
- FIPS 204 ML-DSA (Final) — https://csrc.nist.gov/pubs/fips/204/final
- FIPS 205 SLH-DSA (Final) — https://csrc.nist.gov/pubs/fips/205/final
- FIPS 206 FN-DSA / Falcon (Draft) — https://csrc.nist.gov/presentations/2025/fips-206-fn-dsa-falcon
- RFC 9881 (ML-DSA sizes) — https://datatracker.ietf.org/doc/rfc9881/
- NIST additional-signatures on-ramp (14 Round-2 candidates) — https://www.nist.gov/news-events/news/2024/10/nist-announces-14-candidates-advance-second-round-additional-digital

## Exposure scanner (implementation)
- ethers v6 Transaction (`fromPublicKey`, `from`, `unsignedHash`) — https://docs.ethers.org/v6/api/transaction/
- ethers v6 crypto (`SigningKey.recoverPublicKey`, `recoverAddress`) — https://docs.ethers.org/v6/api/crypto/
- ethers.js transaction/address.ts source — https://github.com/ethers-io/ethers.js/blob/main/src.ts/transaction/address.ts
- Alchemy `alchemy_getAssetTransfers` — https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers
- Alchemy — transaction history how-to — https://www.alchemy.com/docs/how-to-get-transaction-history-for-an-address-on-ethereum

## ERC-4337 / migration / 7702
- ERC-4337 spec — https://eips.ethereum.org/EIPS/eip-4337
- eth-infinitism UserOperationLib.sol (v0.7 packing/offsets) — https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/core/UserOperationLib.sol
- v0.7 UserOp packing changes — https://hackmd.io/@tomteman-ef/userop_packing_changes
- EntryPoint v0.8 released (EIP-712 hash, native 7702, Simple7702Account) — https://erc4337.substack.com/p/entrypoint-v08-released
- EIP-7702: Set Code for EOAs — https://eips.ethereum.org/EIPS/eip-7702
- Pimlico: ERC-4337 vs EIP-7702 — https://docs.pimlico.io/guides/eip7702/erc4337-vs-eip7702
- EIP-7702 security considerations (Halborn) — https://www.halborn.com/blog/post/eip-7702-security-considerations
- ethresear.ch — PQ upgrade via 7702 + ZK (why 7702 alone fails) — https://ethresear.ch/t/upgrade-any-ethereum-wallet-to-post-quantum-security-in-one-transaction-using-zk-proofs-with-a-hidden-public-key/24754
- EIP-8164: native key delegation for EOAs — https://eips.ethereum.org/EIPS/eip-8164
- Pimlico bundler usage / endpoints — https://docs.pimlico.io/infra/bundler/usage
- Pimlico singleton-paymaster — https://github.com/pimlicolabs/singleton-paymaster
- eth-sweep (tokens first, ETH last) — https://github.com/bitcoinwarrior1/eth-sweep
- ethers.js — send all native tokens (EIP-1559) — https://github.com/ethers-io/ethers.js/discussions/4161
- Vitalik — quantum emergency hard-fork recovery — https://ethresear.ch/t/how-to-hard-fork-to-save-most-users-funds-in-a-quantum-emergency/18901

## PQ landscape / on-chain verifiers
- ZKNOX ETHFALCON repo (gas benchmarks) — https://github.com/ZKNoxHQ/ETHFALCON
- EIP-8052 (Falcon precompile, ~3k gas target) — https://eips.ethereum.org/EIPS/eip-8052
- ethresear.ch — road to PQ Ethereum via AA (gas figures) — https://ethresear.ch/t/the-road-to-post-quantum-ethereum-transaction-is-paved-with-account-abstraction-aa/21783
- RIP-7212 explainer — https://www.alchemy.com/blog/what-is-rip-7212
- poqeth (efficient PQ verification on Ethereum) — https://eprint.iacr.org/2025/091.pdf
- Quantus quantum risk checker — https://quantus.com/quantum-risk-checker
- Quantum Canary — https://quantumcanary.org/insights/is-your-crypto-secure

## Caveats carried into the docs
- **65% (exposed pubkey) ≠ 0.1% (dormant/unrecoverable)** — different questions; never conflate.
- CRQC timeline is genuinely uncertain (physical-qubit estimates span ~600×). Always a range.
- Exposure percentages are modeled, not exact measurements.
- ZKNOX "20×" / partnership claims, "$0.07" SPHINCS+, and the 2029 Lean Ethereum date are
  unaudited/unshipped projections. Verified facts: ETHFALCON gas (1.5–3.9M), EIP-8052 ~3k
  target (draft), RIP-7212 live on L2, Algorand Falcon state proofs live.
- A "~90M ETH" absolute figure seen in secondary press could not be verified — do not cite.
