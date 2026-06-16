import type { NonceReuseFinding, SignatureSample } from "./types.js";

/**
 * Detect ECDSA nonce reuse. If two signatures by the same key share the same `r`
 * (the x-coordinate of k·G) with DIFFERENT `s`, the per-signature nonce `k` was
 * reused, and the private key can be recovered with classical algebra - the
 * infamous bug behind the PS3 / early Android Bitcoin thefts. This is a
 * present-day break, independent of quantum computing.
 */
export const detectNonceReuse = (
  samples: SignatureSample[],
): NonceReuseFinding => {
  const byR = new Map<string, { txHashes: string[]; sValues: Set<string> }>();

  for (const s of samples) {
    const r = s.r.toLowerCase();
    const entry = byR.get(r) ?? { txHashes: [], sValues: new Set<string>() };
    entry.txHashes.push(s.txHash);
    entry.sValues.add(s.s.toLowerCase());
    byR.set(r, entry);
  }

  const collisions: { r: string; txHashes: string[] }[] = [];
  let classicallyBroken = false;

  for (const [r, entry] of byR) {
    if (entry.txHashes.length > 1) {
      collisions.push({ r, txHashes: entry.txHashes });
      // distinct s values on a shared r ⇒ genuine nonce reuse ⇒ key recoverable
      if (entry.sValues.size > 1) classicallyBroken = true;
    }
  }

  return { reused: collisions.length > 0, classicallyBroken, collisions };
};
