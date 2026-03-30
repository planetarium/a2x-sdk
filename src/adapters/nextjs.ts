import type { AgentCard } from '@a2a-js/sdk';
import type { JsonRpcTransportHandler } from '@a2a-js/sdk/server';

export function createNextjsHandlers(
  transportHandler: JsonRpcTransportHandler,
) {
  return {
    POST: async (req: Request): Promise<Response> => {
      const body = await req.json();
      const result = await transportHandler.handle(body);

      // Streaming detection: if result is an async generator, use SSE
      if (result && Symbol.asyncIterator in Object(result)) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            for await (const chunk of result as AsyncGenerator) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
              );
            }
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      return Response.json(result);
    },
  };
}

export function createAgentCardRoute(agentCard: AgentCard) {
  return {
    GET: (): Response => Response.json(agentCard),
  };
}
