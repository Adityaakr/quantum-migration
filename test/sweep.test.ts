import { describe, expect, it } from "vitest";

import {
  computeEthSweepValue,
  type SweepExecutor,
  sweepFrom,
} from "../src/index.js";

const DEST = "0x9999999999999999999999999999999999999999";

/** Fake executor that records the order of operations. */
class FakeExecutor implements SweepExecutor {
  calls: string[] = [];
  constructor(
    private balances: Record<string, bigint>,
    private eth: bigint,
  ) {}
  async owner() {
    return "0x1111111111111111111111111111111111111111";
  }
  async erc20Balance(token: string) {
    return this.balances[token] ?? 0n;
  }
  async erc20Transfer(token: string, to: string, amount: bigint) {
    this.calls.push(`erc20:${token}:${amount}`);
    return `0xtoken_${token.slice(2, 6)}`;
  }
  async ethBalance() {
    return this.eth;
  }
  async maxFeePerGas() {
    return 1_000_000_000n;
  }
  async maxPriorityFeePerGas() {
    return 1_000_000_000n;
  }
  async estimateEthGasLimit() {
    return 21_000n;
  }
  async sendEth(to: string, value: bigint) {
    this.calls.push(`eth:${value}`);
    return "0xeth";
  }
}

describe("computeEthSweepValue", () => {
  it("leaves a gas reserve", () => {
    // balance 1 ETH, maxFee 2 gwei, gas 21000 → reserve = 42000 gwei
    const balance = 10n ** 18n;
    const value = computeEthSweepValue(balance, 2_000_000_000n, 21_000n);
    expect(value).toBe(balance - 21_000n * 2_000_000_000n);
    expect(value).toBeLessThan(balance);
  });

  it("can go negative when balance < reserve (caller must check)", () => {
    expect(computeEthSweepValue(1000n, 2_000_000_000n, 21_000n)).toBeLessThan(0n);
  });
});

describe("sweepFrom", () => {
  const TOKEN_A = "0xaaaa000000000000000000000000000000000000";
  const TOKEN_B = "0xbbbb000000000000000000000000000000000000";

  it("sweeps tokens FIRST, then ETH LAST", async () => {
    const exec = new FakeExecutor({ [TOKEN_A]: 100n, [TOKEN_B]: 200n }, 10n ** 18n);
    const report = await sweepFrom(exec, {
      destination: DEST,
      tokens: [TOKEN_A, TOKEN_B],
    });

    expect(exec.calls[0]).toBe(`erc20:${TOKEN_A}:100`);
    expect(exec.calls[1]).toBe(`erc20:${TOKEN_B}:200`);
    expect(exec.calls[2]!.startsWith("eth:")).toBe(true);
    expect(report.results.filter((r) => r.success && !r.skipped)).toHaveLength(3);
  });

  it("skips zero-balance tokens", async () => {
    const exec = new FakeExecutor({ [TOKEN_A]: 0n }, 0n);
    const report = await sweepFrom(exec, {
      destination: DEST,
      tokens: [TOKEN_A],
      sweepEth: false,
    });
    expect(exec.calls).toHaveLength(0);
    expect(report.results[0]?.skipped).toBe(true);
  });

  it("skips ETH when balance is below the gas reserve", async () => {
    const exec = new FakeExecutor({}, 1000n); // dust
    const report = await sweepFrom(exec, { destination: DEST });
    const eth = report.results.find((r) => r.type === "eth");
    expect(eth?.skipped).toBe(true);
    expect(exec.calls).toHaveLength(0);
  });

  it("records a per-asset failure without aborting the rest", async () => {
    const exec = new FakeExecutor({ [TOKEN_A]: 100n }, 10n ** 18n);
    exec.erc20Transfer = async () => {
      throw new Error("transfer reverted");
    };
    const report = await sweepFrom(exec, {
      destination: DEST,
      tokens: [TOKEN_A],
    });
    const tokenResult = report.results.find((r) => r.type === "erc20");
    expect(tokenResult?.success).toBe(false);
    expect(tokenResult?.error).toContain("reverted");
    // ETH sweep still ran afterwards
    expect(report.results.some((r) => r.type === "eth" && r.success)).toBe(true);
  });
});
