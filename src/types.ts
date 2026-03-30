import type {
  AgentCard,
  Message,
  Part,
  Task,
} from '@a2a-js/sdk';
import type {
  JsonRpcTransportHandler,
  TaskStore,
} from '@a2a-js/sdk/server';

// ── Payment Configuration ──────────────────────────────────

export interface PaymentConfig {
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  eip712Name?: string;
  eip712Version?: string;
}

export interface NormalizedPaymentConfig {
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  eip712Name: string;
  eip712Version: string;
}

// ── Skill Configuration ────────────────────────────────────

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

// ── Execute Function ───────────────────────────────────────

export interface ExecuteContext {
  text: string;
  parts: Part[];
  message: Message;
  taskId: string;
  contextId: string;
  task?: Task;
  receipt?: PaymentReceipt;
}

export interface PaymentReceipt {
  success: boolean;
  transaction: string;
  network: string;
}

export type ExecuteResult =
  | { text: string }
  | { parts: Part[] }
  | { stream: AsyncIterable<string> };

export type ExecuteFn = (context: ExecuteContext) => Promise<ExecuteResult>;

// ── Agent Configuration ────────────────────────────────────

export interface AgentConfig {
  name: string;
  description: string;
  version: string;
  skills: SkillConfig[];
  payment?: PaymentConfig | PaymentConfig[];
  execute: ExecuteFn;
  taskStore?: TaskStore;
  baseUrl?: string;
  a2aPath?: string;
  protocolVersion?: string;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  streaming?: boolean;
  provider?: { organization: string; url: string };
}

// ── Agent Instance ─────────────────────────────────────────

export interface AgentInstance {
  readonly agentCard: AgentCard;
  readonly transportHandler: JsonRpcTransportHandler;
  nextjs(): { POST: (req: Request) => Promise<Response> };
  agentCardRoute(): { GET: () => Response };
  express(): { router: () => unknown };
  register(registryUrl?: string): Promise<{ id: string }>;
}
