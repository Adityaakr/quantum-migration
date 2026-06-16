import { BrowserProvider, hexlify, JsonRpcProvider, type Signer } from "ethers";
import { type AuditChain, blockscoutHistorySource } from "quantum-migration";

export const SUPPORTED_CHAINS: Record<number, { name: string; rpc: string }> = {
  11155111: {
    name: "Sepolia",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  421614: {
    name: "Arbitrum Sepolia",
    rpc: "https://arbitrum-sepolia-rpc.publicnode.com",
  },
};

export type Wallet = {
  provider: BrowserProvider;
  signer: Signer;
  address: string;
  chainId: number;
};

export async function connectWallet(): Promise<Wallet> {
  if (!window.ethereum) throw new Error("No injected wallet found (install MetaMask/Rabby).");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);
  return { provider, signer, address, chainId };
}

export function readProvider(chainId: number): JsonRpcProvider {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain ${chainId}`);
  return new JsonRpcProvider(chain.rpc);
}

/** 32 random bytes as a 0x hex string. */
export function randomSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hexlify(bytes);
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/* ---- real block explorers (verified to resolve) ---- */
const e = (base: string) => ({ tx: `${base}/tx/`, address: `${base}/address/` });

export const EXPLORERS: Record<string, { tx: string; address: string }> = {
  Ethereum: e("https://etherscan.io"),
  Sepolia: e("https://sepolia.etherscan.io"),
  Hoodi: e("https://eth-hoodi.blockscout.com"), // etherscan blocks bots; blockscout is open
  Arbitrum: e("https://arbiscan.io"),
  "Arbitrum Sepolia": e("https://sepolia.arbiscan.io"),
  Base: e("https://basescan.org"),
  Optimism: e("https://optimistic.etherscan.io"),
  Polygon: e("https://polygonscan.com"),
  BNB: e("https://bscscan.com"),
  Avalanche: e("https://snowscan.xyz"),
  Gnosis: e("https://gnosis.blockscout.com"),
  Linea: e("https://lineascan.build"),
  Scroll: e("https://scrollscan.com"),
  Blast: e("https://blastscan.io"),
  Mantle: e("https://mantlescan.xyz"),
  Celo: e("https://celoscan.io"),
};

/** chainId -> explorer/chain name used in EXPLORERS + buildAuditChains. */
export const CHAIN_NAME: Record<number, string> = {
  1: "Ethereum",
  11155111: "Sepolia",
  560048: "Hoodi",
  42161: "Arbitrum",
  421614: "Arbitrum Sepolia",
  8453: "Base",
  10: "Optimism",
  137: "Polygon",
  56: "BNB",
  43114: "Avalanche",
  100: "Gnosis",
  59144: "Linea",
  534352: "Scroll",
  81457: "Blast",
  5000: "Mantle",
  42220: "Celo",
};

export const txUrl = (chainName: string | undefined, hash: string): string | undefined => {
  const x = chainName ? EXPLORERS[chainName] : undefined;
  return x ? x.tx + hash : undefined;
};
export const addressUrl = (chainName: string | undefined, addr: string): string | undefined => {
  const x = chainName ? EXPLORERS[chainName] : undefined;
  return x ? x.address + addr : undefined;
};

/** Chains the deep audit covers. History (Blockscout) enables the crypto proof. */
export function buildAuditChains(): AuditChain[] {
  const c = (
    name: string,
    chainId: number,
    rpc: string,
    nativeSymbol = "ETH",
    api?: string,
  ): AuditChain => ({
    name,
    chainId,
    nativeSymbol,
    provider: new JsonRpcProvider(rpc),
    history: api ? blockscoutHistorySource(api) : undefined,
  });
  return [
    // mainnets (history source -> enables signature recovery + proof on that chain)
    c("Ethereum", 1, "https://ethereum-rpc.publicnode.com", "ETH", "https://eth.blockscout.com/api"),
    c("Arbitrum", 42161, "https://arbitrum-one-rpc.publicnode.com"),
    c("Base", 8453, "https://base-rpc.publicnode.com", "ETH", "https://base.blockscout.com/api"),
    c("Optimism", 10, "https://optimism-rpc.publicnode.com", "ETH", "https://optimism.blockscout.com/api"),
    c("Polygon", 137, "https://polygon-bor-rpc.publicnode.com", "POL"),
    c("BNB", 56, "https://bsc-rpc.publicnode.com", "BNB"),
    c("Avalanche", 43114, "https://avalanche-c-chain-rpc.publicnode.com", "AVAX"),
    c("Gnosis", 100, "https://gnosis-rpc.publicnode.com", "xDAI", "https://gnosis.blockscout.com/api"),
    c("Linea", 59144, "https://linea-rpc.publicnode.com"),
    c("Scroll", 534352, "https://scroll-rpc.publicnode.com"),
    c("Blast", 81457, "https://blast-rpc.publicnode.com"),
    c("Mantle", 5000, "https://mantle-rpc.publicnode.com", "MNT"),
    c("Celo", 42220, "https://celo-rpc.publicnode.com", "CELO"),
    // testnets
    c("Sepolia", 11155111, "https://ethereum-sepolia-rpc.publicnode.com", "ETH", "https://eth-sepolia.blockscout.com/api"),
    c("Hoodi", 560048, "https://ethereum-hoodi-rpc.publicnode.com", "ETH", "https://eth-hoodi.blockscout.com/api"),
  ];
}
