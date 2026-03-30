import type { AgentCard } from '@a2a-js/sdk';
import { DEFAULT_REGISTRY_URL } from '../constants.js';
import { A2xError } from '../errors.js';

export async function registerAgent(
  agentCard: AgentCard,
  registryUrl: string = DEFAULT_REGISTRY_URL,
): Promise<{ id: string }> {
  const agentBaseUrl = agentCard.url.replace(/\/api\/a2a\/?$/, '');

  const response = await fetch(`${registryUrl}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: agentBaseUrl }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new A2xError(
      'REGISTRY_ERROR',
      `Registration failed (${response.status}): ${body}`,
    );
  }

  return response.json();
}
