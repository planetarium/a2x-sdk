export const X402_EXTENSION_URI =
  'https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2';

export const X402_METADATA_KEYS = {
  STATUS: 'x402.payment.status',
  REQUIRED: 'x402.payment.required',
  PAYLOAD: 'x402.payment.payload',
  RECEIPTS: 'x402.payment.receipts',
  ERROR: 'x402.payment.error',
} as const;

export const USDC_ADDRESSES = {
  BASE_SEPOLIA: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  BASE_MAINNET: '0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913',
} as const;

export const DEFAULT_REGISTRY_URL = 'https://a2a-agent-registry.fly.dev';
