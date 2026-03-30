import type { AgentCard } from '@a2a-js/sdk';
import type { DefaultRequestHandler } from '@a2a-js/sdk/server';

export function createExpressHandlers(
  requestHandler: DefaultRequestHandler,
  agentCard: AgentCard,
) {
  return {
    router: () => {
      // Dynamic imports to avoid requiring express as a dependency
      const {
        jsonRpcHandler,
        agentCardHandler,
        UserBuilder,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
      } = require('@a2a-js/sdk/server/express');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const express = require('express');
      const router = express.Router();

      router.post(
        '/api/a2a',
        express.json(),
        jsonRpcHandler({
          requestHandler,
          userBuilder: UserBuilder.noAuthentication(),
        }),
      );

      router.get(
        '/.well-known/agent.json',
        agentCardHandler({
          agentCardProvider: async () => agentCard,
        }),
      );

      router.get(
        '/.well-known/agent-card.json',
        agentCardHandler({
          agentCardProvider: async () => agentCard,
        }),
      );

      return router;
    },
  };
}
