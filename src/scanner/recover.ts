import {
  computeAddress,
  type Provider,
  Transaction,
  type TransactionResponse,
} from "ethers";

/**
 * Recover the uncompressed secp256k1 public key (0x04…) that signed a transaction.
 *
 * Works across all signed tx types (legacy / 2930 / 1559 / 7702) because ethers'
 * `Transaction` rebuilds the correct EIP-2718 unsigned digest internally. See
 * ../../docs/03-exposure-scanner.md.
 */
export const recoverPublicKeyFromResponse = (t: TransactionResponse): string => {
  const tx = Transaction.from({
    type: t.type ?? undefined,
    chainId: t.chainId,
    nonce: t.nonce,
    gasLimit: t.gasLimit,
    gasPrice: t.gasPrice ?? undefined,
    maxFeePerGas: t.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: t.maxPriorityFeePerGas ?? undefined,
    to: t.to,
    value: t.value,
    data: t.data,
    accessList: t.accessList ?? undefined,
    signature: t.signature,
  });

  const pubkey = tx.fromPublicKey;
  if (!pubkey) throw new Error("Could not recover public key (unsigned tx?)");

  if (tx.from && computeAddress(pubkey).toLowerCase() !== tx.from.toLowerCase()) {
    throw new Error("Recovered public key does not match the tx sender");
  }
  return pubkey;
};

/** Fetch a sent transaction by hash and recover the signer's public key. */
export const recoverPublicKeyFromTxHash = async (
  provider: Provider,
  txHash: string,
): Promise<string> => {
  const t = await provider.getTransaction(txHash);
  if (!t) throw new Error(`Transaction not found: ${txHash}`);
  return recoverPublicKeyFromResponse(t);
};
