import type { NormalizedPaymentConfig, PaymentConfig } from './types.js';

export function normalizePaymentConfig(
  config: PaymentConfig | PaymentConfig[],
): NormalizedPaymentConfig[] {
  const configs = Array.isArray(config) ? config : [config];
  return configs.map((c) => ({
    network: c.network,
    asset: c.asset,
    payTo: c.payTo,
    amount: c.amount,
    eip712Name: c.eip712Name ?? 'USDC',
    eip712Version: c.eip712Version ?? '2',
  }));
}
