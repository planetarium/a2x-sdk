import type { AgentCard } from '@a2a-js/sdk';
import type {
  DefaultRequestHandler,
  JsonRpcTransportHandler,
} from '@a2a-js/sdk/server';
import { createNextjsHandlers, createAgentCardRoute } from './adapters/nextjs.js';
import { createExpressHandlers } from './adapters/express.js';
import { registerAgent } from './registry/registry-client.js';
import type { AgentInstance } from './types.js';

export class Agent implements AgentInstance {
  constructor(
    public readonly agentCard: AgentCard,
    public readonly transportHandler: JsonRpcTransportHandler,
    private readonly requestHandler: DefaultRequestHandler,
  ) {}

  nextjs() {
    return createNextjsHandlers(this.transportHandler);
  }

  agentCardRoute() {
    return createAgentCardRoute(this.agentCard);
  }

  express() {
    return createExpressHandlers(this.requestHandler, this.agentCard);
  }

  register(registryUrl?: string) {
    return registerAgent(this.agentCard, registryUrl);
  }
}
