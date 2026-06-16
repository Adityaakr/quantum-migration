import { ethers } from "ethers";

/** ERC-4337 EntryPoint v0.7 (canonical mainnet/testnet address). */
export const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export const ACCOUNT_ABI = [
  "function execute(address dest, uint256 value, bytes calldata func) external",
  "function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external",
  "function getNonce() external view returns (uint256)",
];

/** ERC-4337 v0.7 PackedUserOperation (TS view; bundler receives the unpacked form). */
export type UserOperation = {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string; // verificationGasLimit (high 128) ‖ callGasLimit (low 128)
  preVerificationGas: bigint;
  gasFees: string; // maxPriorityFeePerGas (high 128) ‖ maxFeePerGas (low 128)
  paymasterAndData: string;
  signature: string;
};

export type GasEstimates = {
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
};

/** Floor for on-chain post-quantum verification (ML-DSA is millions of gas). */
export const MIN_VERIFICATION_GAS = 13_500_000n;
export const DEFAULT_CALL_GAS = 500_000n;

export const packUint128 = (a: bigint, b: bigint): string =>
  ethers.solidityPacked(["uint128", "uint128"], [a, b]);

export const unpackUint128 = (packed: string): [bigint, bigint] => {
  const bytes = ethers.getBytes(packed);
  const first = BigInt(ethers.hexlify(bytes.slice(0, 16)));
  const second = BigInt(ethers.hexlify(bytes.slice(16, 32)));
  return [first, second];
};

const ACCOUNT_IFACE = new ethers.Interface(ACCOUNT_ABI);

/** Encode `account.execute(dest, value, func)` — the single-call account method. */
export const encodeExecute = (
  to: string,
  value: bigint,
  data: string,
): string => ACCOUNT_IFACE.encodeFunctionData("execute", [to, value, data]);

/** Encode `account.executeBatch(...)` — one hybrid signature, many calls. */
export const encodeExecuteBatch = (
  calls: { to: string; value: bigint; data: string }[],
): string =>
  ACCOUNT_IFACE.encodeFunctionData("executeBatch", [
    calls.map((c) => c.to),
    calls.map((c) => c.value),
    calls.map((c) => c.data),
  ]);

/**
 * Build an ERC-4337 v0.7 UserOperation from an already-encoded account-level
 * `callData` (e.g. the output of `encodeExecute` / `encodeExecuteBatch`). Gas-fee
 * values come from the bundler (passed in to keep this pure).
 */
export const createBaseUserOperation = async (params: {
  provider: ethers.Provider;
  accountAddress: string;
  callData: string;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
}): Promise<UserOperation> => {
  const account = new ethers.Contract(
    params.accountAddress,
    ACCOUNT_ABI,
    params.provider,
  );

  let nonce: bigint;
  try {
    nonce = await account.getFunction("getNonce")();
  } catch {
    nonce = 0n;
  }

  return {
    sender: params.accountAddress,
    nonce,
    initCode: "0x",
    callData: params.callData,
    accountGasLimits: packUint128(MIN_VERIFICATION_GAS, DEFAULT_CALL_GAS),
    preVerificationGas: 1_000_000n,
    gasFees: packUint128(params.maxPriorityFeePerGas, params.maxFeePerGas),
    paymasterAndData: "0x",
    signature: "0x",
  };
};

/** Convert the packed UserOp into the unpacked JSON-RPC shape bundlers expect. */
export const userOpToBundlerFormat = (userOp: UserOperation) => {
  const [verificationGasLimit, callGasLimit] = unpackUint128(
    userOp.accountGasLimits,
  );
  const [maxPriorityFeePerGas, maxFeePerGas] = unpackUint128(userOp.gasFees);

  return {
    sender: userOp.sender,
    nonce: "0x" + userOp.nonce.toString(16),
    callData: userOp.callData,
    verificationGasLimit: "0x" + verificationGasLimit.toString(16),
    callGasLimit: "0x" + callGasLimit.toString(16),
    preVerificationGas: "0x" + userOp.preVerificationGas.toString(16),
    maxFeePerGas: "0x" + maxFeePerGas.toString(16),
    maxPriorityFeePerGas: "0x" + maxPriorityFeePerGas.toString(16),
    signature: userOp.signature,
  };
};

export const updateUserOpWithGasEstimates = (
  userOp: UserOperation,
  gas: GasEstimates,
): UserOperation => ({
  ...userOp,
  accountGasLimits: packUint128(gas.verificationGasLimit, gas.callGasLimit),
  preVerificationGas: gas.preVerificationGas,
});

/** v0.7 UserOp hash (NOT the EIP-712 v0.8 scheme — see docs/04-migration-flow.md). */
export const getUserOpHash = (
  userOp: UserOperation,
  entryPointAddress: string,
  chainId: bigint,
): string => {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const packedEncoded = abi.encode(
    [
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "bytes32",
      "uint256",
      "bytes32",
      "bytes32",
    ],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      ethers.keccak256(userOp.paymasterAndData),
    ],
  );

  const packedUserOp = ethers.keccak256(packedEncoded);
  const finalEncoded = abi.encode(
    ["bytes32", "address", "uint256"],
    [packedUserOp, entryPointAddress, chainId],
  );

  return ethers.keccak256(finalEncoded);
};
