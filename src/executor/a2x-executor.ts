import type { Message, Task, Part, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';
import { X402_METADATA_KEYS } from '../constants.js';
import type {
  ExecuteContext,
  ExecuteFn,
  ExecuteResult,
  PaymentReceipt,
} from '../types.js';
import { recoverOriginalMessage } from './message-recovery.js';
import { PaymentHandler } from './payment-handler.js';

export class A2xExecutor implements AgentExecutor {
  constructor(
    private readonly executeFn: ExecuteFn,
    private readonly paymentHandler: PaymentHandler | null,
  ) {}

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const { userMessage, taskId, contextId } = requestContext;
    const metadata = (userMessage.metadata ?? {}) as Record<string, unknown>;
    const paymentStatus = metadata[X402_METADATA_KEYS.STATUS] as
      | string
      | undefined;

    // ── Free agent path ──
    if (!this.paymentHandler) {
      await this.runExecute(requestContext, eventBus, null);
      return;
    }

    // ── Paid agent: payment submitted ──
    if (paymentStatus === 'payment-submitted') {
      const result = await this.paymentHandler.handlePaymentSubmission(
        requestContext,
        eventBus,
        metadata,
      );
      if (!result.success) return;

      const originalMessage = recoverOriginalMessage(requestContext);
      const patchedContext = Object.create(requestContext) as RequestContext;
      Object.defineProperty(patchedContext, 'userMessage', {
        value: originalMessage,
        writable: false,
      });

      await this.runExecute(patchedContext, eventBus, result.receipt);
      return;
    }

    // ── Paid agent: initial request → request payment ──
    this.paymentHandler.requestPayment(taskId, contextId, eventBus);
  }

  async cancelTask(
    taskId: string,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const canceled: Task = {
      kind: 'task',
      id: taskId,
      contextId: '',
      status: { state: 'canceled', timestamp: new Date().toISOString() },
    };
    eventBus.publish(canceled);
    eventBus.finished();
  }

  // ── Private ─────────────────────────────────────────────────────

  private async runExecute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    receipt: PaymentReceipt | null,
  ): Promise<void> {
    const { taskId, contextId, userMessage, task } = requestContext;

    // Publish "working" status
    const workingStatus: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      final: false,
      status: { state: 'working', timestamp: new Date().toISOString() },
    };
    eventBus.publish(workingStatus);

    // Build ExecuteContext
    const text = userMessage.parts
      .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
      .map((p) => p.text)
      .join('\n');

    const context: ExecuteContext = {
      text,
      parts: userMessage.parts,
      message: userMessage,
      taskId,
      contextId,
      task,
      receipt: receipt ?? undefined,
    };

    try {
      const result = await this.executeFn(context);
      this.publishResult(result, taskId, contextId, eventBus, receipt);
    } catch (error) {
      this.publishError(taskId, contextId, eventBus, error);
    }
  }

  private publishResult(
    result: ExecuteResult,
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    receipt: PaymentReceipt | null,
  ): void {
    let parts: Part[];
    if ('text' in result) {
      parts = [{ kind: 'text', text: result.text }];
    } else if ('parts' in result) {
      parts = result.parts;
    } else {
      // stream: collect all chunks (v1 limitation)
      // This is handled asynchronously — but since we already awaited
      // executeFn, the stream case should be pre-collected.
      parts = [{ kind: 'text', text: '[streaming not yet supported in v1]' }];
    }

    const metadata: Record<string, unknown> = {};
    if (receipt) {
      metadata[X402_METADATA_KEYS.STATUS] = 'payment-completed';
      metadata[X402_METADATA_KEYS.RECEIPTS] = [receipt];
    }

    const reply: Message = {
      kind: 'message',
      messageId: crypto.randomUUID(),
      role: 'agent',
      taskId,
      contextId,
      parts,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
    eventBus.publish(reply);
    eventBus.finished();
  }

  private publishError(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    error: unknown,
  ): void {
    const message =
      error instanceof Error ? error.message : 'Unknown execution error';

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
          parts: [{ kind: 'text', text: `Execution failed: ${message}` }],
        },
      },
    };
    eventBus.publish(failedStatus);
    eventBus.finished();
  }
}
