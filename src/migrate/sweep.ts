import { Contract, type Signer } from "ethers";

/**
 * Fund migration ("sweep"): move ETH + ERC-20s from a legacy EOA into the new
 * post-quantum account. The legacy EOA still controls these - so these are ordinary
 * signed transactions. Order matters: TOKENS FIRST, ETH LAST (ETH gas can't be
 * predicted exactly). See ../../docs/04-migration-flow.md.
 */

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export type SweepResult = {
  type: "erc20" | "eth";
  token?: string;
  amount: bigint;
  txHash?: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
};

export type SweepReport = {
  destination: string;
  results: SweepResult[];
};

export type SweepOptions = {
  destination: string;
  tokens?: string[];
  sweepEth?: boolean; // default true
  gasLimitEth?: bigint; // default 21000
  feeMultiplier?: bigint; // headroom over current maxFeePerGas, default 2
  onProgress?: (message: string) => void;
};

/**
 * Pure: ETH value to send so a `gasLimit`-gas transfer at `maxFeePerGas` still has a
 * reserve. `maxFeePerGas` should already include any headroom multiplier.
 */
export const computeEthSweepValue = (
  balance: bigint,
  maxFeePerGas: bigint,
  gasLimit: bigint,
): bigint => balance - gasLimit * maxFeePerGas;

/** Abstracts the on-chain ops so `sweepFrom` is fully unit-testable. */
export interface SweepExecutor {
  owner(): Promise<string>;
  erc20Balance(token: string): Promise<bigint>;
  erc20Transfer(token: string, to: string, amount: bigint): Promise<string>;
  ethBalance(): Promise<bigint>;
  maxFeePerGas(): Promise<bigint>;
  maxPriorityFeePerGas(): Promise<bigint>;
  /** Gas needed to send ETH to `to` - higher when `to` is a contract (e.g. the PQ account). */
  estimateEthGasLimit(to: string): Promise<bigint>;
  sendEth(
    to: string,
    value: bigint,
    gasLimit: bigint,
    maxFeePerGas: bigint,
    maxPriorityFeePerGas: bigint,
  ): Promise<string>;
}

/** Real executor backed by an ethers Signer (the legacy EOA). */
export class EthersSweepExecutor implements SweepExecutor {
  constructor(private readonly signer: Signer) {}

  async owner(): Promise<string> {
    return this.signer.getAddress();
  }

  private token(address: string): Contract {
    return new Contract(address, ERC20_ABI, this.signer);
  }

  async erc20Balance(token: string): Promise<bigint> {
    // Guard against addresses with no contract code on this chain (returns "0x",
    // which would otherwise surface as a cryptic BAD_DATA decode error).
    const code = await this.provider().getCode(token);
    if (code === "0x") {
      throw new Error(`No ERC-20 contract found at ${token} on this chain`);
    }
    return this.token(token).getFunction("balanceOf")(await this.owner());
  }

  async estimateEthGasLimit(to: string): Promise<bigint> {
    try {
      const est = await this.provider().estimateGas({
        from: await this.owner(),
        to,
        value: 1n,
      });
      return (est * 3n) / 2n; // 1.5x buffer for contract receive()/fallback
    } catch {
      return 50_000n; // safe fallback covering a smart-account receive()
    }
  }

  async erc20Transfer(token: string, to: string, amount: bigint): Promise<string> {
    const tx = await this.token(token).getFunction("transfer")(to, amount);
    await tx.wait();
    return tx.hash;
  }

  private provider() {
    if (!this.signer.provider) throw new Error("Signer has no provider");
    return this.signer.provider;
  }

  async ethBalance(): Promise<bigint> {
    return this.provider().getBalance(await this.owner());
  }

  async maxFeePerGas(): Promise<bigint> {
    const fee = await this.provider().getFeeData();
    return fee.maxFeePerGas ?? fee.gasPrice ?? 1_000_000_000n;
  }

  async maxPriorityFeePerGas(): Promise<bigint> {
    const fee = await this.provider().getFeeData();
    return fee.maxPriorityFeePerGas ?? 1_000_000_000n;
  }

  async sendEth(
    to: string,
    value: bigint,
    gasLimit: bigint,
    maxFeePerGas: bigint,
    maxPriorityFeePerGas: bigint,
  ): Promise<string> {
    const tx = await this.signer.sendTransaction({
      to,
      value,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    await tx.wait();
    return tx.hash;
  }
}

/**
 * Sweep all ERC-20s (first) then ETH (last) from the executor's owner into
 * `destination`. Never throws on a single asset failure - records it and continues.
 */
export const sweepFrom = async (
  executor: SweepExecutor,
  opts: SweepOptions,
): Promise<SweepReport> => {
  const log = opts.onProgress ?? (() => {});
  const results: SweepResult[] = [];

  // 1) ERC-20 tokens first.
  for (const token of opts.tokens ?? []) {
    try {
      const balance = await executor.erc20Balance(token);
      if (balance === 0n) {
        log(`Skipping ${token} (zero balance)`);
        results.push({ type: "erc20", token, amount: 0n, success: true, skipped: true });
        continue;
      }
      log(`Sweeping ${balance} of ${token}…`);
      const txHash = await executor.erc20Transfer(token, opts.destination, balance);
      results.push({ type: "erc20", token, amount: balance, txHash, success: true });
    } catch (e) {
      results.push({
        type: "erc20",
        token,
        amount: 0n,
        success: false,
        error: (e as Error).message,
      });
    }
  }

  // 2) ETH last (gas can't be predicted exactly - leave a reserve).
  if (opts.sweepEth ?? true) {
    try {
      const balance = await executor.ethBalance();
      // Estimate gas (a contract destination like the PQ account needs > 21000).
      const gasLimit =
        opts.gasLimitEth ?? (await executor.estimateEthGasLimit(opts.destination));
      const maxFeePerGas =
        (await executor.maxFeePerGas()) * (opts.feeMultiplier ?? 2n);
      const maxPriorityFeePerGas = await executor.maxPriorityFeePerGas();
      const value = computeEthSweepValue(balance, maxFeePerGas, gasLimit);

      if (value <= 0n) {
        log("ETH balance is below the gas reserve - skipping ETH sweep");
        results.push({
          type: "eth",
          amount: 0n,
          success: true,
          skipped: true,
          error: "balance below gas reserve",
        });
      } else {
        log(`Sweeping ${value} wei ETH (leaving gas reserve)…`);
        const txHash = await executor.sendEth(
          opts.destination,
          value,
          gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
        );
        results.push({ type: "eth", amount: value, txHash, success: true });
      }
    } catch (e) {
      results.push({
        type: "eth",
        amount: 0n,
        success: false,
        error: (e as Error).message,
      });
    }
  }

  return { destination: opts.destination, results };
};
