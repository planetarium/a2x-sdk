export class A2xError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'A2xError';
  }
}

export const X402ErrorCodes = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH',
  INVALID_PAY_TO: 'INVALID_PAY_TO',
  AMOUNT_EXCEEDED: 'AMOUNT_EXCEEDED',
  VERIFY_FAILED: 'VERIFY_FAILED',
  SETTLE_FAILED: 'SETTLE_FAILED',
} as const;
