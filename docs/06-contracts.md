# 06 — Contracts

What the existing contracts give us, what must change, and what's optional. The Solidity
lives in [`packages/pq-account/src`](../../packages/pq-account/src).

## What already exists (and is correct for us)

- **`ZKNOX_ERC4337_account.sol`** — a `BaseAccount` (EntryPoint v0.7) whose
  `_validateSignature` does `abi.decode(userOp.signature, (bytes, bytes))` →
  `(preQuantumSig, postQuantumSig)` and requires **both** to verify (ECDSA + ML-DSA-44).
  A true hybrid AND-gate. Verifiers are modular behind `ISigVerifier`, deployed once and
  shared (addresses in `deployments.json`).
- **`ZKNOX_PQFactory.sol`** — CREATE2 factory;
  `salt = keccak256(preQuantumPubKey ‖ postQuantumPubKey ‖ VERSION)`. Address is a pure
  function of the two public keys → deterministic, known before deploy. This is exactly
  the new-account-and-sweep model the migration tool needs.

**Conclusion:** no contract changes are strictly required for the MVP sweep flow. The
items below are improvements, ordered by importance.

## Required for NFT migration: token-receiver hooks

`safeTransferFrom` of an ERC-721/1155 into the account **reverts today** — the account
implements neither `onERC721Received` nor `onERC1155Received`. To support NFT sweeps via
the safe path, add the receiver hooks:

```solidity
import {IERC721Receiver} from "openzeppelin/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "openzeppelin/token/ERC1155/IERC1155Receiver.sol";

contract ZKNOX_ERC4337_account is BaseAccount, IERC721Receiver, IERC1155Receiver {
    function onERC721Received(address,address,uint256,bytes calldata)
        external pure returns (bytes4) { return this.onERC721Received.selector; }
    function onERC1155Received(address,address,uint256,uint256,bytes calldata)
        external pure returns (bytes4) { return this.onERC1155Received.selector; }
    function onERC1155BatchReceived(address,address,uint256[] calldata,uint256[] calldata,bytes calldata)
        external pure returns (bytes4) { return this.onERC1155BatchReceived.selector; }
    // + supportsInterface(IERC165)
}
```

MVP workaround without redeploying: use non-safe `transferFrom` for ERC-721 (no hook
required). ERC-1155 has no non-safe path, so it needs the hook.

## Optional: graduated-security policy (a strong follow-on product)

Today every UserOp requires both signatures — expensive, because PQ verification is
millions of gas. A policy layer could require the PQ co-signature only above a value
threshold or for non-whitelisted targets, and allow ECDSA-only for small ops:

```
_validateSignature:
  decode (preSig, postSig?)
  require ECDSA(preSig) valid
  if (callValue >= THRESHOLD || !isWhitelisted(target))
      require MLDSA(postSig) valid
  return SUCCESS
```

This makes the account cheap for daily use while keeping quantum protection where it
matters. It's also the basis of the "Quantum Recovery Vault" idea (PQ as break-glass).
Out of scope for v1 but worth a dedicated design.

## Optional: gasless deploy via EntryPoint factory path

The example deploys via a separate ethers tx (`initCode = "0x"`). To enable gasless
onboarding, deployment can move into a UserOp's `factory`/`factoryData` + a Pimlico
verifying paymaster. No account-contract change needed — just SDK plumbing.

## Verification-cost reality (informs chain choice)

On-chain PQ verification is heavy (verified figures, see
[`09-competitive-landscape.md`](09-competitive-landscape.md)): Falcon ~3.9M gas,
ETHFALCON ~1.5M, ML-DSA ~6.6M. This is why:
- the example sets `verificationGasLimit` floors in the millions,
- we ship **Arbitrum Sepolia first** (L2 gas makes it viable),
- mainnet waits for cheaper verification / precompiles (EIP-8051/8052 target ~3k gas).

## Do NOT change

- The **v0.7 UserOp packing and hash** in the SDK/example are correct. Changing them is
  only needed for EntryPoint v0.8 (native EIP-7702), which this tool deliberately avoids
  (see [`04-migration-flow.md`](04-migration-flow.md)).
- The CREATE2 salt scheme — it's what makes the address deterministic and the funnel
  "compute address before deploy" work.

## Testing

Foundry tests already cover the account across schemes
(`packages/pq-account/test/ZKNOX_ERC4337_account_*.t.sol`). Add:
- a test that NFT `safeTransferFrom` into the account succeeds **after** adding hooks,
- a sweep integration test (fund an EOA on a fork, run the SDK sweep, assert balances).
