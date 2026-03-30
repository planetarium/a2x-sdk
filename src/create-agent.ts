import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
} from '@a2a-js/sdk/server';
import { Agent } from './agent.js';
import { buildAgentCard } from './card/card-builder.js';
import { A2xError } from './errors.js';
import { A2xExecutor } from './executor/a2x-executor.js';
import { PaymentHandler } from './executor/payment-handler.js';
import type { AgentConfig, AgentInstance } from './types.js';
import { normalizePaymentConfig } from './utils.js';

function validateConfig(config: AgentConfig): void {
  if (!config.name) {
    throw new A2xError('INVALID_CONFIG', 'Agent name is required.');
  }
  if (!config.description) {
    throw new A2xError('INVALID_CONFIG', 'Agent description is required.');
  }
  if (!config.version) {
    throw new A2xError('INVALID_CONFIG', 'Agent version is required.');
  }
  if (!config.skills || config.skills.length === 0) {
    throw new A2xError(
      'INVALID_CONFIG',
      'At least one skill is required.',
    );
  }
  if (!config.execute) {
    throw new A2xError('INVALID_CONFIG', 'Execute function is required.');
  }
}

export function createAgent(config: AgentConfig): AgentInstance {
  validateConfig(config);

  const agentCard = buildAgentCard(config);
  const taskStore = config.taskStore ?? new InMemoryTaskStore();

  const paymentHandler = config.payment
    ? new PaymentHandler(normalizePaymentConfig(config.payment))
    : null;

  const executor = new A2xExecutor(config.execute, paymentHandler);

  const requestHandler = new DefaultRequestHandler(
    agentCard,
    taskStore,
    executor,
  );
  const transportHandler = new JsonRpcTransportHandler(requestHandler);

  return new Agent(agentCard, transportHandler, requestHandler);
}
