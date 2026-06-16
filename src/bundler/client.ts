import {
  ENTRY_POINT_ADDRESS,
  type GasEstimates,
  MIN_VERIFICATION_GAS,
  type UserOperation,
  userOpToBundlerFormat,
} from "../core/userOperation.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type UserOpReceipt = {
  success: boolean;
  receipt: { transactionHash: string; [k: string]: any };
  actualGasUsed?: string;
  actualGasCost?: string;
  [k: string]: any;
};

/**
 * Thin ERC-4337 bundler client (JSON-RPC). Defaults match Pimlico but the shape is
 * standard, so any v0.7 bundler works. Adds the `waitForUserOp` receipt poll that the
 * original example lacked (see docs/04-migration-flow.md).
 */
export class BundlerClient {
  constructor(
    private readonly url: string,
    private readonly entryPoint: string = ENTRY_POINT_ADDRESS,
  ) {}

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? `${method} failed`);
    if (json.result === undefined) throw new Error(`${method}: empty result`);
    return json.result;
  }

  /** Pimlico gas-price helper. Falls back to conservative defaults on failure. */
  async getGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    try {
      const r = await this.rpc<any>("pimlico_getUserOperationGasPrice", []);
      return {
        maxFeePerGas: BigInt(r.standard.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(r.standard.maxPriorityFeePerGas),
      };
    } catch {
      return {
        maxFeePerGas: 200_000_000n, // 0.2 gwei
        maxPriorityFeePerGas: 100_000_000n, // 0.1 gwei
      };
    }
  }

  async estimateGas(userOp: UserOperation): Promise<GasEstimates> {
    try {
      const r = await this.rpc<any>("eth_estimateUserOperationGas", [
        userOpToBundlerFormat(userOp),
        this.entryPoint,
      ]);
      let verificationGasLimit = BigInt(r.verificationGasLimit);
      if (verificationGasLimit < MIN_VERIFICATION_GAS) {
        verificationGasLimit = MIN_VERIFICATION_GAS; // PQ verification floor
      }
      return {
        verificationGasLimit,
        callGasLimit: BigInt(r.callGasLimit),
        preVerificationGas: BigInt(r.preVerificationGas ?? userOp.preVerificationGas),
      };
    } catch {
      return {
        verificationGasLimit: MIN_VERIFICATION_GAS,
        callGasLimit: 500_000n,
        preVerificationGas: userOp.preVerificationGas,
      };
    }
  }

  async sendUserOperation(userOp: UserOperation): Promise<string> {
    return this.rpc<string>("eth_sendUserOperation", [
      userOpToBundlerFormat(userOp),
      this.entryPoint,
    ]);
  }

  async getUserOperationReceipt(userOpHash: string): Promise<UserOpReceipt | null> {
    return this.rpc<UserOpReceipt | null>("eth_getUserOperationReceipt", [
      userOpHash,
    ]);
  }

  /** Poll until the UserOp is included (or times out). The missing piece from the example. */
  async waitForUserOp(
    userOpHash: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<UserOpReceipt> {
    const interval = opts.intervalMs ?? 3_000;
    const timeout = opts.timeoutMs ?? 120_000;
    const start = Date.now();

    for (;;) {
      const receipt = await this.getUserOperationReceipt(userOpHash).catch(() => null);
      if (receipt) return receipt;
      if (Date.now() - start > timeout) {
        throw new Error(`Timed out waiting for UserOp ${userOpHash}`);
      }
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

/** Construct a bundler client (Pimlico-style URL, but any v0.7 bundler works). */
export const pimlico = (url: string, entryPoint?: string): BundlerClient =>
  new BundlerClient(url, entryPoint);
