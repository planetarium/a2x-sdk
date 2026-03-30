import type { Message, Task } from '@a2a-js/sdk';
import type {
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';
import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { X402_METADATA_KEYS } from '../constants.js';
import type { NormalizedPaymentConfig, PaymentReceipt } from '../types.js';

// Local x402 types — mirrors the reference agent's types so we don't
// need the x402 package at import time for free agents.
interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

interface X402PaymentRequiredResponse {
  x402Version: 1;
  accepts: PaymentRequirements[];
}

interface PaymentPayload {
  x402Version: 1;
  network: string;
  scheme: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

type PaymentResult =
  | { success: true; receipt: PaymentReceipt }
  | { success: false };

export class PaymentHandler {
  private facilitator: ReturnType<typeof import('x402/verify').useFacilitator> | null =
    null;

  constructor(
    private readonly paymentConfigs: NormalizedPaymentConfig[],
  ) {}

  private getFacilitator() {
    if (!this.facilitator) {
      // Dynamic import at runtime — x402 is only loaded when payments are used
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useFacilitator } = require('x402/verify') as typeof import('x402/verify');
      this.facilitator = useFacilitator();
    }
    return this.facilitator;
  }

  // ── Phase 1: Request Payment ────────────────────────────────────

  requestPayment(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
  ): void {
    const paymentRequired: X402PaymentRequiredResponse = {
      x402Version: 1,
      accepts: this.paymentConfigs.map((c) => ({
        scheme: 'exact' as const,
        network: c.network,
        maxAmountRequired: c.amount,
        asset: c.asset,
        payTo: c.payTo,
        resource: 'baseFee',
        description: 'Service fee',
        mimeType: 'application/json',
        maxTimeoutSeconds: 300,
        extra: { name: c.eip712Name, version: c.eip712Version },
      })),
    };

    // Publish task first so it's persisted in the store
    const taskEvent: Task = {
      kind: 'task',
      id: taskId,
      contextId,
      status: { state: 'submitted', timestamp: new Date().toISOString() },
    };
    eventBus.publish(taskEvent);

    // Publish input-required with payment requirements
    const statusUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      final: true,
      status: {
        state: 'input-required',
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message',
          messageId: crypto.randomUUID(),
          role: 'agent',
          taskId,
          contextId,
          parts: [
            {
              kind: 'text',
              text: 'Payment is required to use this service.',
            },
          ],
          metadata: {
            [X402_METADATA_KEYS.STATUS]: 'payment-required',
            [X402_METADATA_KEYS.REQUIRED]: paymentRequired,
          },
        },
      },
    };
    eventBus.publish(statusUpdate);
    // Do NOT call eventBus.finished() — task stays open for resumption
  }

  // ── Phase 2: Handle Payment Submission ──────────────────────────

  async handlePaymentSubmission(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    metadata: Record<string, unknown>,
  ): Promise<PaymentResult> {
    const { taskId, contextId, task } = requestContext;

    // Extract payment payload from message metadata
    const paymentPayload = metadata[X402_METADATA_KEYS.PAYLOAD] as
      | PaymentPayload
      | undefined;
    if (!paymentPayload?.payload?.authorization) {
      this.failPayment(
        taskId, contextId, eventBus,
        'unknown', 'INVALID_PAYLOAD',
        'Payment payload is missing or malformed.',
      );
      return { success: false };
    }

    // Find matching requirements: first from task history, then from config
    const accepted = this.findAcceptedRequirements(paymentPayload, task);
    if (!accepted) {
      this.failPayment(
        taskId, contextId, eventBus,
        paymentPayload.network, 'NETWORK_MISMATCH',
        `Network/scheme "${paymentPayload.network}/${paymentPayload.scheme}" is not accepted.`,
      );
      return { success: false };
    }

    // Validate payTo address
    const { authorization } = paymentPayload.payload;
    if (authorization.to.toLowerCase() !== accepted.payTo.toLowerCase()) {
      this.failPayment(
        taskId, contextId, eventBus,
        paymentPayload.network, 'INVALID_PAY_TO',
        `payTo mismatch: expected ${accepted.payTo}, got ${authorization.to}.`,
      );
      return { success: false };
    }

    // Validate amount
    if (BigInt(authorization.value) > BigInt(accepted.maxAmountRequired)) {
      this.failPayment(
        taskId, contextId, eventBus,
        paymentPayload.network, 'AMOUNT_EXCEEDED',
        `Amount ${authorization.value} exceeds maximum ${accepted.maxAmountRequired}.`,
      );
      return { success: false };
    }

    // Verify with facilitator
    const facilitator = this.getFacilitator();
    const verifyResult = await facilitator.verify(
      paymentPayload as unknown as Parameters<typeof facilitator.verify>[0],
      accepted as unknown as Parameters<typeof facilitator.verify>[1],
    );
    if (!verifyResult.isValid) {
      this.failPayment(
        taskId, contextId, eventBus,
        paymentPayload.network, 'VERIFY_FAILED',
        verifyResult.invalidReason ?? 'Payment verification failed.',
      );
      return { success: false };
    }

    // Settle on-chain
    const settleResult = await facilitator.settle(
      paymentPayload as unknown as Parameters<typeof facilitator.settle>[0],
      accepted as unknown as Parameters<typeof facilitator.settle>[1],
    );
    if (!settleResult.success) {
      this.failPayment(
        taskId, contextId, eventBus,
        paymentPayload.network, 'SETTLE_FAILED',
        settleResult.errorReason ?? 'Payment settlement failed.',
      );
      return { success: false };
    }

    return {
      success: true,
      receipt: {
        success: true,
        transaction: settleResult.transaction,
        network: paymentPayload.network,
      },
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private findAcceptedRequirements(
    paymentPayload: PaymentPayload,
    task?: Task,
  ): PaymentRequirements | undefined {
    const history = task?.history ?? [];

    // Try to recover stored requirements from task history
    const paymentRequiredMsg = history.find(
      (m) =>
        m.role === 'agent' &&
        (m.metadata as Record<string, unknown>)?.[X402_METADATA_KEYS.STATUS] ===
          'payment-required',
    );
    const storedResponse = (
      paymentRequiredMsg?.metadata as Record<string, unknown> | undefined
    )?.[X402_METADATA_KEYS.REQUIRED] as X402PaymentRequiredResponse | undefined;

    if (storedResponse) {
      return storedResponse.accepts.find(
        (a) =>
          a.network === paymentPayload.network &&
          a.scheme === paymentPayload.scheme,
      );
    }

    // Fallback: build requirements from current config
    return this.paymentConfigs
      .filter((f) => f.network === paymentPayload.network)
      .map(
        (fee): PaymentRequirements => ({
          scheme: 'exact',
          network: fee.network,
          maxAmountRequired: fee.amount,
          asset: fee.asset,
          payTo: fee.payTo,
          resource: 'baseFee',
          description: 'Service fee',
          mimeType: 'application/json',
          maxTimeoutSeconds: 300,
          extra: { name: fee.eip712Name, version: fee.eip712Version },
        }),
      )
      .find((r) => r.scheme === paymentPayload.scheme);
  }

  private failPayment(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    network: string,
    errorCode: string,
    reason: string,
  ): void {
    const failedStatus: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      final: true,
      status: {
        state: 'failed',
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message',
          messageId: crypto.randomUUID(),
          role: 'agent',
          taskId,
          contextId,
          parts: [
            { kind: 'text', text: `Payment verification failed: ${reason}` },
          ],
          metadata: {
            [X402_METADATA_KEYS.STATUS]: 'payment-failed',
            [X402_METADATA_KEYS.ERROR]: errorCode,
            [X402_METADATA_KEYS.RECEIPTS]: [
              {
                success: false,
                errorReason: reason,
                network,
                transaction: '',
              },
            ],
          },
        },
      },
    };
    eventBus.publish(failedStatus);
    eventBus.finished();
  }
}
