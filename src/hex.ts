/**
 * Convert a hex string (with or without `0x`) to a fixed-length Uint8Array.
 * Used to turn a 32-byte seed into the byte array consumed by ML-DSA keygen.
 */
export const hexToU8 = (hex: string, expectedBytes = 32): Uint8Array => {
  if (hex.startsWith("0x")) hex = hex.slice(2);

  if (hex.length !== expectedBytes * 2) {
    throw new Error(
      `Hex must be ${expectedBytes} bytes (${expectedBytes * 2} hex chars)`,
    );
  }

  return Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
};
