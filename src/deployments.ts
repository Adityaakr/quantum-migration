/**
 * Deployed ZKNOX factory + verifier addresses.
 *
 * Mirrors `packages/pq-account/deployments/deployments.json` (kept inline so the
 * published SDK is self-contained). If the source JSON changes, update this file.
 * The `accounts.<combo>.address` entries are the deployed FACTORY addresses for each
 * (postQuantum, preQuantum) scheme pair — you call `createAccount` / `getAddress` on them.
 */

export type NetworkKey = "sepolia" | "arbitrumSepolia";
export type AccountMode =
  | "mldsa_k1"
  | "mldsa_r1"
  | "mldsaeth_k1"
  | "mldsaeth_r1"
  | "falcon_k1"
  | "falcon_r1"
  | "ethfalcon_k1"
  | "ethfalcon_r1";

type FactoryEntry = { address: string; postQuantum: string; preQuantum: string };

export const CHAIN_TO_NETWORK: Record<number, NetworkKey> = {
  11155111: "sepolia",
  421614: "arbitrumSepolia",
};

export const DEPLOYMENTS: Record<NetworkKey, { factories: Partial<Record<AccountMode, FactoryEntry>> }> = {
  sepolia: {
    factories: {
      mldsa_k1: { address: "0xe28F039653772C32b0eDB1db7c7A5FA250DDA0e5", postQuantum: "mldsa", preQuantum: "ecdsa_k1" },
      mldsa_r1: { address: "0x01Ff8790a7615Db192ca1005fe60d0732f432eF5", postQuantum: "mldsa", preQuantum: "ecdsa_r1" },
      mldsaeth_k1: { address: "0x053116Dae2F3F966B2957D11f87A8Ff298ae31C2", postQuantum: "mldsaeth", preQuantum: "ecdsa_k1" },
      mldsaeth_r1: { address: "0x3b68f42a9eAfDF85D64492Cc68d5C88d1a525c05", postQuantum: "mldsaeth", preQuantum: "ecdsa_r1" },
      falcon_k1: { address: "0x43D1B09AC488ea1CF2De674Adb3cB97fa0A51c00", postQuantum: "falcon", preQuantum: "ecdsa_k1" },
      falcon_r1: { address: "0x9984bc6D728991Df5C5662B865b7024a11909999", postQuantum: "falcon", preQuantum: "ecdsa_r1" },
      ethfalcon_k1: { address: "0x75de9AF9902978826bc99E48f468b682bE17F416", postQuantum: "ethfalcon", preQuantum: "ecdsa_k1" },
      ethfalcon_r1: { address: "0x93115df4f05728Effe3845B552Be5Ff8f183a908", postQuantum: "ethfalcon", preQuantum: "ecdsa_r1" },
    },
  },
  arbitrumSepolia: {
    factories: {
      mldsa_k1: { address: "0xe28F039653772C32b0eDB1db7c7A5FA250DDA0e5", postQuantum: "mldsa", preQuantum: "ecdsa_k1" },
    },
  },
};

/** Resolve the factory address for a network + scheme combo, or throw if undeployed. */
export const getFactoryAddress = (
  network: NetworkKey,
  mode: AccountMode = "mldsa_k1",
): string => {
  const entry = DEPLOYMENTS[network]?.factories[mode];
  if (!entry) {
    throw new Error(`No ${mode} factory deployed on ${network}`);
  }
  return entry.address;
};

export const networkForChainId = (chainId: number | bigint): NetworkKey => {
  const network = CHAIN_TO_NETWORK[Number(chainId)];
  if (!network) throw new Error(`Unsupported chainId ${chainId}`);
  return network;
};
