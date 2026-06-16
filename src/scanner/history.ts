import type { TxHistorySource, TxMeta } from "./types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Etherscan-style history source — uses the `txlist` endpoint (ascending). Works
 * with Etherscan V2 (one key, many chains) and clones (Blockscout). Returns full tx
 * metadata so the audit can derive harvest-age and reuse-after-exposure.
 */
export const etherscanHistorySource = (opts: {
  apiKey: string;
  baseUrl?: string;
}): TxHistorySource => {
  const fetchTxs = async (address: string, limit: number): Promise<TxMeta[]> => {
    const base = opts.baseUrl ?? "https://api.etherscan.io/api";
    const url =
      `${base}?module=account&action=txlist&address=${address}` +
      `&startblock=0&endblock=99999999&page=1&offset=${Math.max(limit, 50)}` +
      `&sort=asc&apikey=${opts.apiKey}`;

    const res = await fetch(url);
    const json = (await res.json()) as any;
    if (!Array.isArray(json.result)) return [];

    return json.result.map((tx: any) => ({
      hash: tx.hash as string,
      from: (tx.from ?? "") as string,
      to: (tx.to ?? "") as string,
      timeStamp: Number(tx.timeStamp ?? 0),
      blockNumber: Number(tx.blockNumber ?? 0),
    }));
  };

  const sentHashes = async (address: string, limit: number) =>
    (await fetchTxs(address, limit))
      .filter((tx) => tx.from.toLowerCase() === address.toLowerCase())
      .map((tx) => tx.hash)
      .slice(0, limit);

  return {
    async firstSentTxHash(address: string) {
      return (await sentHashes(address, 1))[0] ?? null;
    },
    async sentTxHashes(address: string, limit = 10) {
      return sentHashes(address, limit);
    },
    async transactions(address: string, limit = 50) {
      return fetchTxs(address, limit);
    },
  };
};

/**
 * Blockscout history source — Blockscout exposes the Etherscan-compatible `txlist`
 * API and needs no API key. `baseUrl` is the explorer's `/api` endpoint, e.g.
 * `https://eth-sepolia.blockscout.com/api`.
 */
export const blockscoutHistorySource = (baseUrl: string): TxHistorySource =>
  etherscanHistorySource({ apiKey: "", baseUrl });

/**
 * Alchemy history source — uses `alchemy_getAssetTransfers` (ascending, first only).
 * Misses 0-value contract calls; pair with the nonce flag for completeness.
 */
export const alchemyHistorySource = (opts: {
  rpcUrl: string;
}): TxHistorySource => ({
  async firstSentTxHash(address: string): Promise<string | null> {
    const res = await fetch(opts.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [
          {
            fromAddress: address,
            fromBlock: "0x0",
            toBlock: "latest",
            category: ["external"],
            order: "asc",
            maxCount: "0x1",
          },
        ],
      }),
    });
    const json = (await res.json()) as any;
    return json?.result?.transfers?.[0]?.hash ?? null;
  },
});
