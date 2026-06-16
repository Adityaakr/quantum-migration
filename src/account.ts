import { ethers } from "ethers";

import { BundlerClient } from "./bundler/client.js";
import {
  type AccountMode,
  getFactoryAddress,
  type NetworkKey,
  networkForChainId,
} from "./deployments.js";
import {
  createBaseUserOperation,
  encodeExecute,
  encodeExecuteBatch,
  ENTRY_POINT_ADDRESS,
  getUserOpHash,
  updateUserOpWithGasEstimates,
  type UserOperation,
} from "./core/userOperation.js";
import type { PostQuantumSigner, PreQuantumSigner } from "./signers/types.js";

const FACTORY_ABI = [
  "function createAccount(bytes preQuantumPubKey, bytes postQuantumPubKey) external returns (address)",
  "function getAddress(bytes preQuantumPubKey, bytes postQuantumPubKey) external view returns (address payable)",
];

export type Call = { to: string; value?: bigint; data?: string };

export type PQAccountOptions = {
  preQuantum: PreQuantumSigner;
  postQuantum: PostQuantumSigner;
  provider: ethers.Provider;
  bundler: BundlerClient;
  /** Defaults to the provider's chainId → network mapping. */
  network?: NetworkKey;
  /** Scheme combo (factory) to use. Default `mldsa_k1`. */
  mode?: AccountMode;
  entryPoint?: string;
};

/**
 * Hybrid post-quantum ERC-4337 account handle. Wraps key derivation, deterministic
 * address resolution, deployment, and hybrid-signed UserOp submission.
 */
export class PQAccount {
  private constructor(
    private readonly cfg: Required<Omit<PQAccountOptions, "network">> & {
      network: NetworkKey;
      chainId: bigint;
      factoryAddress: string;
      preQuantumPubKey: string;
      postQuantumPubKey: string;
    },
  ) {}

  static async create(opts: PQAccountOptions): Promise<PQAccount> {
    const chainId = (await opts.provider.getNetwork()).chainId;
    const network = opts.network ?? networkForChainId(chainId);
    const mode = opts.mode ?? "mldsa_k1";

    const [preQuantumPubKey, postQuantumPubKey] = await Promise.all([
      opts.preQuantum.publicKey(),
      opts.postQuantum.publicKeyEncoded(),
    ]);

    return new PQAccount({
      preQuantum: opts.preQuantum,
      postQuantum: opts.postQuantum,
      provider: opts.provider,
      bundler: opts.bundler,
      mode,
      entryPoint: opts.entryPoint ?? ENTRY_POINT_ADDRESS,
      network,
      chainId,
      factoryAddress: getFactoryAddress(network, mode),
      preQuantumPubKey,
      postQuantumPubKey,
    });
  }

  /** Deterministic CREATE2 address for this key pair (known before deployment). */
  async getAddress(): Promise<string> {
    const factory = new ethers.Contract(
      this.cfg.factoryAddress,
      FACTORY_ABI,
      this.cfg.provider,
    );
    return factory.getFunction("getAddress")(
      this.cfg.preQuantumPubKey,
      this.cfg.postQuantumPubKey,
    );
  }

  async isDeployed(): Promise<boolean> {
    const code = await this.cfg.provider.getCode(await this.getAddress());
    return code !== "0x";
  }

  /**
   * Deploy the account via the factory. `deployer` (the funding EOA) signs and pays.
   * Returns the deterministic account address.
   */
  async deploy(deployer: ethers.Signer): Promise<string> {
    const address = await this.getAddress();
    if ((await this.cfg.provider.getCode(address)) !== "0x") return address;

    const factory = new ethers.Contract(
      this.cfg.factoryAddress,
      FACTORY_ABI,
      deployer,
    );
    const tx = await factory.getFunction("createAccount")(
      this.cfg.preQuantumPubKey,
      this.cfg.postQuantumPubKey,
    );
    await tx.wait();
    return address;
  }

  /** Sign a UserOp hash with BOTH schemes and ABI-encode as (bytes, bytes). */
  private async signHybrid(userOp: UserOperation): Promise<string> {
    const hash = getUserOpHash(userOp, this.cfg.entryPoint, this.cfg.chainId);
    const [pre, post] = await Promise.all([
      this.cfg.preQuantum.sign(hash),
      this.cfg.postQuantum.sign(hash),
    ]);
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "bytes"],
      [pre, post],
    );
  }

  /** Build (from final account callData) → hybrid-sign → submit. Returns the UserOp hash. */
  private async buildAndSubmit(accountCallData: string): Promise<string> {
    const sender = await this.getAddress();
    const { maxFeePerGas, maxPriorityFeePerGas } =
      await this.cfg.bundler.getGasPrice();

    let userOp = await createBaseUserOperation({
      provider: this.cfg.provider,
      accountAddress: sender,
      callData: accountCallData,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    const gas = await this.cfg.bundler.estimateGas(userOp);
    userOp = updateUserOpWithGasEstimates(userOp, gas);
    // Signature must be computed LAST — it covers the gas fields.
    userOp.signature = await this.signHybrid(userOp);

    return this.cfg.bundler.sendUserOperation(userOp);
  }

  /** Build → hybrid-sign → submit a single call. Returns the UserOp hash. */
  async send(call: Call): Promise<string> {
    return this.buildAndSubmit(
      encodeExecute(call.to, call.value ?? 0n, call.data ?? "0x"),
    );
  }

  /** Batch multiple calls under one hybrid signature (account.executeBatch). */
  async sendBatch(calls: Call[]): Promise<string> {
    return this.buildAndSubmit(
      encodeExecuteBatch(
        calls.map((c) => ({
          to: c.to,
          value: c.value ?? 0n,
          data: c.data ?? "0x",
        })),
      ),
    );
  }

  async waitForUserOp(userOpHash: string) {
    return this.cfg.bundler.waitForUserOp(userOpHash);
  }

}
