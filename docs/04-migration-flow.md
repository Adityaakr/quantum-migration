# 04 — Migration Flow

Move funds from a quantum-exposed legacy EOA into a fresh hybrid post-quantum account.

## Strategy decision: new-account-and-sweep (NOT in-place EIP-7702)

This is the single most important architectural call, and the research settles it.

| Dimension | In-place EIP-7702 delegation | **New-account-and-sweep** ✅ |
| --- | --- | --- |
| Address | same EOA address kept | new CREATE2 address |
| Quantum security | ❌ **fatal** — secp256k1 key still natively controls the address; a quantum attacker who recovers it can re-delegate or drain | ✅ funds move under a key the exposed secp256k1 key no longer controls |
| Disable old key | impossible natively (needs EIP-8164 / ZK schemes — not our stack) | yes — abandon the EOA |
| EntryPoint | needs **v0.8** (native 7702) | **v0.7** ✅ (already used in this repo) |
| Reuse ZKNOX account | needs initializable rewrite (no constructor storage) | works as-is (constructor-deployed CREATE2) |

**Why 7702 is disqualifying here:** EIP-7702 keeps ECDSA-over-secp256k1 as the *sole
native* authentication for the address. Even after delegating to PQ logic, the protocol
still honors a valid ECDSA authorization/tx from the EOA key — so a quantum attacker who
recovers that key can simply re-delegate the EOA to their own contract and drain it. You
**cannot** sever the EOA key's authority under plain 7702. The entire point of this tool
is to get funds *off* the exposed key, so keeping the address defeats the purpose.

The existing `ZKNOX_PQFactory` already implements the correct model: CREATE2 with
`salt = keccak256(preQuantumPubKey ‖ postQuantumPubKey ‖ VERSION)`, producing a brand-new
address controlled by an **ECDSA ∧ ML-DSA-44 AND-gate**.

> 7702 *can* play a supporting role: delegate the **legacy EOA** purely to batch the
> sweep into one atomic tx (better UX). But the terminal state must be "funds in the new
> PQ account, EOA abandoned" — never "EOA delegated and still holding funds."

## End-to-end sequence

```
USER                  LEGACY EOA (secp256k1)              NEW ZKNOX ACCOUNT (CREATE2)
 │  scan → EXPOSED          │                                      │
 │  derive PQ key (browser) │                                      │
 │  compute new address ◀───┼── factory.getAddress(preQ, postQ)    │  (deterministic, pre-deploy)
 │  deploy ─────────────────┼── factory.createAccount(preQ,postQ)─▶│  (EOA pays gas, or paymaster)
 │  sweep ERC-20s ──────────┼── token.transfer(new, balanceOf) ───▶│  (per token)
 │  sweep NFTs ─────────────┼── ERC721.transferFrom(EOA,new,id) ──▶│  (needs receiver hook — see 06)
 │  sweep ETH (LAST) ───────┼── send (balance − gasReserve) ──────▶│  receive() payable
 │  verify balances ◀───────┼──────────────────────────────────────┤
 │  retire EOA              ✗ (do not reuse)                        │  funds consolidated, PQ-safe
```

## Step 1 — Derive keys & compute the new address

- **Pre-quantum:** the connected wallet's ECDSA address (no new key needed — reuse the
  user's existing signer, or generate a fresh ECDSA key for the new account).
- **Post-quantum:** derive ML-DSA-44 in-browser via `@noble/post-quantum`
  (`ml_dsa44.keygen(seed)`), then expand+encode the public key for on-chain storage
  (`to_expanded_encoded_bytes`, already in the example).
- **New address:** `factory.getAddress(preQuantumPubKey, postQuantumPubKey)` — known
  before any deploy.

⚠️ **Key-source rule:** do NOT take the PQ seed from a textbox (the example's pattern,
flagged "test seeds only"). The migration tool must source it from a passkey-derived seed
or an encrypted local keystore so the user can reproduce it later to actually *spend*.
See [`05-sdk-design.md`](05-sdk-design.md) §"PQSigner".

## Step 2 — Deploy the account

- MVP: `factory.createAccount(...)` as a normal ethers tx (EOA pays gas) — exactly what
  `examples/.../createAccount.ts` already does.
- Gasless (fast-follow): fold the factory into a UserOp's `factory`/`factoryData` and
  attach a Pimlico verifying paymaster — account deploys with the user paying nothing.

## Step 3 — Sweep (tokens first, ETH last)

The EOA is **not yet compromised** — it still holds its key — so sweeps are ordinary
signed transactions. Order matters because ETH gas can't be predicted exactly:

```
for each ERC-20:  token.transfer(newAccount, balanceOf(EOA))      // no approval needed to move your own tokens
for each ERC-721: token.transferFrom(EOA, newAccount, tokenId)    // enumerate owned ids via indexer/logs
finally ETH:      send (balance − gasReserve) as the LAST tx
```

Final ETH sweep with a safe reserve (ethers v6):

```ts
const bal = await provider.getBalance(eoa);
const fee = await provider.getFeeData();
const maxFeePerGas = fee.maxFeePerGas! * 2n;          // headroom vs rising baseFee
const gasLimit = 21000n;                              // new account has receive() payable
const value = bal - gasLimit * maxFeePerGas;
if (value <= 0n) throw new Error("balance below gas reserve");
await signer.sendTransaction({ to: newAccount, value, gasLimit, maxFeePerGas,
                               maxPriorityFeePerGas: fee.maxPriorityFeePerGas! });
```

### Sweep gotchas

- **Dust is unavoidable** on ETH — over-reserve and you leave more, under-reserve and the
  last tx fails. ~2× current `maxFeePerGas × 21000` is a safe reserve.
- **Non-standard ERC-20s** (USDT returns no bool) — use a tolerant ABI; don't
  `require(success)` on the return.
- **Fee-on-transfer / rebasing tokens** — `balanceOf` then `transfer` can race; re-read.
- **NFTs need a receiver hook.** `safeTransferFrom` into the ZKNOX account **reverts**
  today because it lacks `onERC721Received`/`onERC1155Received`. Either add the hooks
  (see [`06-contracts.md`](06-contracts.md)) or use non-safe `transferFrom` for ERC-721.
- **Order & nonces:** await each sweep sequentially; ETH sweep strictly last.
- **One-and-done:** after the final sweep, the EOA is retired. Never route new funds
  through it — its secp256k1 key is the permanent quantum liability.

## Step 4 — Operate the new account (optional, post-migration)

Subsequent actions go through Pimlico as hybrid-signed UserOps (the example's
`sendTransaction` / Aave flows already do this). The bundler flow:

```
pimlico_getUserOperationGasPrice → [pm_getPaymasterStubData] → eth_estimateUserOperationGas
→ [pm_getPaymasterData] → sign hybrid (ECDSA ∧ ML-DSA-44) over the v0.7 userOpHash
→ eth_sendUserOperation → poll eth_getUserOperationReceipt
```

**Code gaps to fix (from research):**
1. No `eth_getUserOperationReceipt` polling — the example returns the userOpHash but never
   confirms inclusion or surfaces revert reasons. **Add the poll loop.**
2. Re-sign the hybrid signature **after** attaching a paymaster (the signature covers
   `paymasterAndData`).
3. The v0.7 packing/hash in the example are **correct** — don't change them unless moving
   to v0.8 (only needed for native 7702, which we're deliberately not using).
