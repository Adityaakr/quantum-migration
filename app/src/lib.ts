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

