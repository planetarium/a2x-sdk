import type { Message } from '@a2a-js/sdk';
import type { RequestContext } from '@a2a-js/sdk/server';
import { X402_METADATA_KEYS } from '../constants.js';

function hasProtocolMetadata(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata) return false;
  return !!(
    metadata[X402_METADATA_KEYS.STATUS] ||
    metadata[X402_METADATA_KEYS.PAYLOAD]
  );
}

/**
 * Recovers the original user message from task history.
 * When a payment message is submitted, the current userMessage is
 * the payment message — not the original user query.
 * This walks task.history to find the first user message without
 * protocol metadata.
 */
export function recoverOriginalMessage(
  requestContext: RequestContext,
): Message {
  const { task, userMessage } = requestContext;
  const history = task?.history ?? [];

  const original = history.find(
    (m) =>
      m.role === 'user' &&
      !hasProtocolMetadata(m.metadata as Record<string, unknown> | undefined),
  );

  return (original as unknown as Message) ?? userMessage;
}
