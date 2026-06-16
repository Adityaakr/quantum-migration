# 03 — Exposure Scanner

Detect whether an address's secp256k1 public key has been revealed on-chain, and score
the quantum risk. This is the product's front door.

## Core fact

`address = keccak256(pubkey)[12:]`. The public key is **recoverable from any signed
transaction** the address sent (ECDSA public-key recovery from `(r, s, v)` — the same
operation that derives `tx.from`). Therefore:

- **Never sent a tx** (`nonce == 0`, no outgoing tx) → only the *hash* is on-chain →
  **UNEXPOSED** (quantum-safe until first spend).
- **Sent ≥ 1 tx** → public key permanently public → **EXPOSED**.

The cheapest oracle is the nonce: `eth_getTransactionCount(addr, "latest") > 0` ⟺
exposed. One RPC call, decentralized, authoritative. Everything else just produces the
actual pubkey artifact for display.

## Scoring model

```
nonce       = eth_getTransactionCount(addr, 'latest')
code        = eth_getCode(addr)                  // "0x" ⇒ EOA, 0xef0100… ⇒ 7702-delegated EOA, else contract
balanceUSD  = native + ERC20/ERC721 holdings priced
reused      = received funds AFTER first send?   // amplifies risk
```

| Level | Condition | Meaning |
| --- | --- | --- |
| **CONTRACT** | `code != "0x"` and not `0xef0100…` | No single secp256k1 key; pivot to its privileged EOAs |
| **UNEXPOSED** | EOA, `nonce == 0`, no sent tx | Only the hash on-chain. Score 0 |
| **EXPOSED** | EOA, `nonce > 0` | Pubkey recoverable; key derivable by a CRQC |
| **HIGH RISK** | EXPOSED **and** `balanceUSD ≥ threshold` | Live, drainable target — migrate first |

`score = exposureWeight × valueWeight(balanceUSD) × (reused ? 1.3 : 1.0)`.
ENS-bearing addresses are a soft risk amplifier (more likely reused & high-value).

## Recovering the public key (ethers v6)

ethers v6 does the heavy lifting — `Transaction.from(...).fromPublicKey` recovers the key
across all tx types via `tx.unsignedHash` (no manual per-type RLP needed).

```ts
import { JsonRpcProvider, Transaction, computeAddress } from "ethers";

// txHash must be a tx SENT BY the target address
async function recoverPubkeyFromTxHash(provider: JsonRpcProvider, txHash: string) {
  const t = await provider.getTransaction(txHash);
  if (!t) throw new Error("tx not found");
  const tx = Transaction.from({
    type: t.type, chainId: t.chainId, nonce: t.nonce, gasLimit: t.gasLimit,
    gasPrice: t.gasPrice ?? undefined,
    maxFeePerGas: t.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: t.maxPriorityFeePerGas ?? undefined,
    to: t.to, value: t.value, data: t.data,
    accessList: t.accessList ?? undefined,
    signature: t.signature,            // { r, s, yParity/v }
  });
  const pubkey = tx.fromPublicKey;     // 0x04-prefixed uncompressed key
  if (!pubkey || computeAddress(pubkey).toLowerCase() !== tx.from!.toLowerCase())
    throw new Error("pubkey/address mismatch");
  return pubkey;
}
```

If the node exposes `eth_getRawTransactionByHash`, it's even shorter:
`Transaction.from(rawHex).fromPublicKey`.

## Finding the first outgoing tx

| Approach | Use for | Pros | Cons |
| --- | --- | --- | --- |
| `eth_getTransactionCount` | the **exposed/unexposed flag** | 1 call, decentralized, authoritative | can't locate the actual tx |
| `alchemy_getAssetTransfers` (`fromAddress`, `order:"asc"`, `maxCount:"0x1"`, `category:["external"]`) | the **tx hash to recover from** | purpose-built, one call | misses 0-value contract calls (still exposed) |
| Etherscan `account&action=txlist` (`sort=asc&offset=1`) | fallback for the tx hash | includes 0-value txs | centralized, rate-limited |
| raw block scan | last resort | fully decentralized | infeasible over full history |

**Recommended:** nonce for the boolean; Alchemy/Etherscan only when you need a hash to
recover & display the key. If nonce > 0 but the transfers API returns nothing (0-value
sends), fall back to Etherscan `txlist`.

## Algorithm (pseudocode)

```
function scanAddress(addr):
    addr = resolveENS(addr)
    code = eth_getCode(addr)
    if code != "0x":
        if not code.startsWith(0xef0100):                 // not a 7702-delegated EOA
            owners = extractPrivilegedEOAs(addr)           // owner(), multisig signers, deployer
            return { level: "CONTRACT", subResults: owners.map(scanAddress) }
        // else: delegated EOA — still key-controlled, continue

    nonce = eth_getTransactionCount(addr, "latest")
    if nonce == 0 and not delegated:
        firstTx = indexerFirstSentTx(addr)                 // may be null
        if firstTx == null: return { level: "UNEXPOSED", score: 0 }
    else:
        firstTx = indexerFirstSentTx(addr) ?? scanBlocks(addr)

    pubkey  = recoverPubkeyFromTxHash(firstTx)             // verify computeAddress == addr
    valueUSD = priceHoldings(addr)
    reused   = hasIncomingAfterFirstSend(addr)
    level    = valueUSD >= HIGH_VALUE_THRESHOLD ? "HIGH_RISK" : "EXPOSED"
    return { level, pubkey, valueUSD, reused,
             remediation: "migrate funds to a fresh post-quantum account" }
```

## Edge cases (bake these in)

- **EIP-7702 leaks extra keys.** A type-4 tx exposes the sender's key *and* every
  `authorizationList` authority's key (each is a secp256k1 signature). A delegated EOA's
  `code` is `0xef0100 ‖ <addr>` — special-case this prefix so delegated EOAs aren't
  misclassified as contracts.
- **Receiving never exposes.** Log topics, `to` fields, and balances reveal only the
  20-byte address. Don't flag receive-only addresses.
- **Contracts have no EOA key.** A contract address derives from its deployer, not a key
  — categorically not "exposed" in the EOA sense. The real surface is its owner/signer
  EOAs; recurse into those in thorough mode.
- **All signed tx types recover identically** (legacy / 2930 / 1559 / 7702) because
  `tx.unsignedHash` encodes the correct EIP-2718 envelope; only the digest construction
  differs, not the recover step.

## UI output

- Big verdict badge (UNEXPOSED / EXPOSED / HIGH RISK) + USD at risk.
- Plain-language explainer ("you sent a tx on <date>, which published your public key").
- The recovered public key (collapsible, for the curious / credibility).
- A single prominent CTA → the migration flow ([`04-migration-flow.md`](04-migration-flow.md)).
