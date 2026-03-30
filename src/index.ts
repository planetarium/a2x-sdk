// ── Factory ──
export { createAgent } from './create-agent.js';

// ── Types ──
export type {
  AgentConfig,
  AgentInstance,
  SkillConfig,
  PaymentConfig,
  ExecuteContext,
  ExecuteResult,
  ExecuteFn,
  PaymentReceipt,
} from './types.js';

// ── Errors ──
export { A2xError, X402ErrorCodes } from './errors.js';

// ── Constants ──
export { USDC_ADDRESSES } from './constants.js';

// ── Re-exports from @a2a-js/sdk for convenience ──
export type {
  AgentCard,
  Message,
  Task,
  Part,
  TextPart,
  FilePart,
  DataPart,
} from '@a2a-js/sdk';
export type { TaskStore } from '@a2a-js/sdk/server';
