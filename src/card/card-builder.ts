import type { AgentCard } from '@a2a-js/sdk';
import { X402_EXTENSION_URI } from '../constants.js';
import type { AgentConfig } from '../types.js';

export function buildAgentCard(config: AgentConfig): AgentCard {
  const baseUrl =
    config.baseUrl ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    'http://localhost:3000';
  const a2aPath = config.a2aPath ?? '/api/a2a';

  const extensions: AgentCard['capabilities']['extensions'] = [];
  if (config.payment) {
    extensions.push({
      uri: X402_EXTENSION_URI,
      description:
        'Supports payments using the x402 protocol for on-chain settlement.',
      required: true,
    });
  }

  return {
    name: config.name,
    description: config.description,
    version: config.version,
    protocolVersion: config.protocolVersion ?? '0.3.0',
    url: `${baseUrl}${a2aPath}`,
    skills: config.skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags,
      examples: s.examples,
      inputModes: s.inputModes,
      outputModes: s.outputModes,
    })),
    capabilities: {
      streaming: config.streaming ?? true,
      extensions: extensions.length > 0 ? extensions : undefined,
    },
    defaultInputModes: config.defaultInputModes ?? ['text/plain'],
    defaultOutputModes: config.defaultOutputModes ?? ['text/plain'],
    provider: config.provider,
  };
}
