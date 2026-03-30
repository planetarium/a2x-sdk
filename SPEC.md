# @a2x/sdk (TypeScript) - 구현 명세서

## Context

a2x 생태계에서 개발자가 A2A + X402 에이전트를 만들려면 현재 레퍼런스 구현체(github-repo-analyzer) 기준으로 **~700줄의 보일러플레이트**가 필요하다. @a2x/sdk는 이를 **~16줄**로 줄여, "30분 안에 첫 에이전트 배포" 목표를 달성한다.

SDK는 `@a2a-js/sdk`(A2A 프로토콜 처리)와 `x402`(결제 검증/정산)를 내부적으로 조합하여, 개발자가 비즈니스 로직만 작성하면 되는 단일 `createAgent()` API를 제공한다.

---

## 1. 프로젝트 구조

```
sdk/a2x-sdk/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                       # Public API exports
│   ├── create-agent.ts                # createAgent() 팩토리
│   ├── agent.ts                       # Agent 클래스 (AgentInstance 구현)
│   ├── types.ts                       # 모든 Public 타입 정의
│   ├── constants.ts                   # X402 메타데이터 키, 프로토콜 상수
│   ├── errors.ts                      # A2xError, 에러 코드
│   ├── utils.ts                       # 공유 유틸리티
│   ├── executor/
│   │   ├── a2x-executor.ts       # AgentExecutor 구현체
│   │   ├── payment-handler.ts         # X402 결제 라이프사이클
│   │   └── message-recovery.ts        # 원본 사용자 메시지 복원
│   ├── card/
│   │   └── card-builder.ts            # AgentConfig → AgentCard 변환
│   ├── adapters/
│   │   ├── nextjs.ts                  # Next.js App Router 어댑터
│   │   └── express.ts                 # Express 어댑터
│   └── registry/
│       └── registry-client.ts         # Agent Registry 등록 클라이언트
└── __tests__/
    ├── create-agent.test.ts
    ├── executor/
    │   ├── a2x-executor.test.ts
    │   ├── payment-handler.test.ts
    │   └── message-recovery.test.ts
    └── card/
        └── card-builder.test.ts
```

---

## 2. Public API 설계

### 2.1 핵심 사용 예시 (개발자 관점)

**에이전트 정의 (`src/lib/agent.ts`)** — 10줄:
```typescript
import { createAgent } from '@a2x/sdk';

export const agent = createAgent({
  name: 'Text Summarizer',
  description: 'Summarizes text into 3 bullet points.',
  version: '1.0.0',
  skills: [{ id: 'summarize', name: 'Summarize', description: 'Summarize text', tags: ['text'] }],
  payment: { network: 'base-sepolia', asset: '0x036CbD...', payTo: '0xWallet', amount: '1000' },
  execute: async (ctx) => {
    const result = await myLlm.summarize(ctx.text);
    return { text: result };
  },
});
```

**A2A 엔드포인트 (`src/app/api/a2a/route.ts`)** — 3줄:
```typescript
import { agent } from '@/lib/agent';
export const dynamic = 'force-dynamic';
export const { POST } = agent.nextjs();
```

**Agent Card 라우트 (`src/app/.well-known/agent.json/route.ts`)** — 3줄:
```typescript
import { agent } from '@/lib/agent';
export const dynamic = 'force-dynamic';
export const { GET } = agent.agentCardRoute();
```

### 2.2 무료 에이전트 (X402 없음)

```typescript
const agent = createAgent({
  name: 'Free Agent',
  description: 'A free agent',
  version: '1.0.0',
  skills: [{ id: 'greet', name: 'Greet', description: 'Says hello', tags: ['utility'] }],
  // payment 생략 → X402 비활성화, execute 즉시 호출
  execute: async (ctx) => ({ text: `Hello! You said: ${ctx.text}` }),
});
```

### 2.3 다중 네트워크 결제

```typescript
const agent = createAgent({
  // ...
  payment: [
    { network: 'base-sepolia', asset: '0x036CbD...', payTo: '0x...', amount: '1000' },
    { network: 'base', asset: '0x833589...', payTo: '0x...', amount: '1000' },
  ],
  execute: async (ctx) => { /* ... */ },
});
```

---

## 3. 타입 정의 (`src/types.ts`)

### 3.1 설정 타입

```typescript
/** X402 결제 설정. SDK가 내부적으로 PaymentRequirements로 변환. */
export interface PaymentConfig {
  network: string;        // 'base-sepolia', 'base', 등
  asset: string;          // 토큰 컨트랙트 주소 (USDC)
  payTo: string;          // 결제 수신 지갑 주소
  amount: string;         // 토큰 최소 단위 (예: '1000' = 0.001 USDC)
  eip712Name?: string;    // 기본값: 'USDC'
  eip712Version?: string; // 기본값: '2'
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentConfig {
  name: string;
  description: string;
  version: string;
  skills: SkillConfig[];
  payment?: PaymentConfig | PaymentConfig[];   // 생략 시 무료 에이전트
  execute: ExecuteFn;
  taskStore?: TaskStore;                       // 커스텀 TaskStore (기본: InMemoryTaskStore)
  baseUrl?: string;                            // 기본: process.env.NEXT_PUBLIC_BASE_URL
  a2aPath?: string;                            // 기본: '/api/a2a'
  protocolVersion?: string;                    // 기본: '0.3.0'
  defaultInputModes?: string[];                // 기본: ['text/plain']
  defaultOutputModes?: string[];               // 기본: ['text/plain']
  streaming?: boolean;                         // 기본: true
  provider?: { organization: string; url: string };
}
```

### 3.2 실행 컨텍스트 & 결과 타입

```typescript
/** execute 함수에 전달되는 컨텍스트. 결제 처리 이후에만 호출됨. */
export interface ExecuteContext {
  text: string;                    // 텍스트 파트 연결 (편의용)
  parts: Part[];                   // 원본 메시지의 모든 파트
  message: Message;                // 원본 A2A Message 객체
  taskId: string;
  contextId: string;
  task?: Task;
  receipt?: PaymentReceipt;        // 결제 영수증 (유료 에이전트일 때)
}

export interface PaymentReceipt {
  success: boolean;
  transaction: string;             // 트랜잭션 해시
  network: string;
}

/** execute 함수의 반환 타입 */
export type ExecuteResult =
  | { text: string }               // 텍스트 응답
  | { parts: Part[] }              // 복합 파트 응답 (파일, 데이터 등)
  | { stream: AsyncIterable<string> }; // 스트리밍 (v1: 내부적으로 버퍼링 후 단일 응답)

export type ExecuteFn = (context: ExecuteContext) => Promise<ExecuteResult>;
```

### 3.3 Agent 인스턴스 타입

```typescript
export interface AgentInstance {
  readonly agentCard: AgentCard;
  readonly transportHandler: JsonRpcTransportHandler;

  /** Next.js App Router POST 핸들러 */
  nextjs(): { POST: (req: Request) => Promise<Response> };

  /** Agent Card GET 핸들러 */
  agentCardRoute(): { GET: () => Response };

  /** Express 라우터 */
  express(): { router: () => any };  // express.Router

  /** Agent Registry 등록 */
  register(registryUrl?: string): Promise<{ id: string }>;
}
```

---

## 4. 핵심 내부 아키텍처

### 4.1 실행 흐름 다이어그램

```
Request 도착
    │
    ▼
A2xExecutor.execute()
    │
    ├── paymentHandler == null?  ─── Yes ──→ runExecute() → 결과 반환
    │
    ├── metadata['x402.payment.status'] == 'payment-submitted'?
    │       │
    │       ├── Yes → PaymentHandler.handlePaymentSubmission()
    │       │           ├── payload 검증 (구조, 네트워크, 주소, 금액)
    │       │           ├── facilitator.verify()
    │       │           ├── facilitator.settle()
    │       │           ├── 실패 → failPayment() → return
    │       │           └── 성공 → recoverOriginalMessage() → runExecute()
    │       │
    │       └── No → PaymentHandler.requestPayment()
    │                   ├── Task 생성 (submitted)
    │                   ├── input-required + PaymentRequirements 발행
    │                   └── return (finished 호출 안 함 → 태스크 유지)
    │
    ▼
runExecute()
    ├── status-update: 'working' 발행
    ├── ExecuteContext 구성 (text, parts, message, receipt)
    ├── 개발자의 execute() 호출
    ├── 결과 Message 발행 (receipts 포함)
    └── eventBus.finished()
```

### 4.2 `createAgent()` 내부 로직 (`src/create-agent.ts`)

```typescript
export function createAgent(config: AgentConfig): AgentInstance {
  // 1. 설정 유효성 검증
  validateConfig(config);

  // 2. AgentCard 빌드
  const agentCard = buildAgentCard(config);

  // 3. TaskStore (사용자 제공 또는 InMemoryTaskStore)
  const taskStore = config.taskStore ?? new InMemoryTaskStore();

  // 4. PaymentHandler (payment 설정이 있을 때만)
  const paymentHandler = config.payment
    ? new PaymentHandler(normalizePaymentConfig(config.payment))
    : null;

  // 5. Executor (개발자의 execute + PaymentHandler 조합)
  const executor = new A2xExecutor(config.execute, paymentHandler);

  // 6. A2A 프로토콜 스택 조립
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
  const transportHandler = new JsonRpcTransportHandler(requestHandler);

  // 7. Agent 인스턴스 반환
  return new Agent(agentCard, transportHandler, requestHandler);
}
```

### 4.3 `A2xExecutor` (`src/executor/a2x-executor.ts`)

`@a2a-js/sdk/server`의 `AgentExecutor` 인터페이스를 구현. 3가지 경로:

1. **무료 에이전트**: `paymentHandler == null` → 즉시 `runExecute()`
2. **유료 - 초기 요청**: `x402.payment.status` 없음 → `requestPayment()`
3. **유료 - 결제 제출**: `x402.payment.status == 'payment-submitted'` → 검증/정산 → `runExecute()`

```typescript
class A2xExecutor implements AgentExecutor {
  constructor(
    private readonly executeFn: ExecuteFn,
    private readonly paymentHandler: PaymentHandler | null,
  ) {}

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void>;

  // Private
  private async runExecute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    receipt: PaymentReceipt | null,
  ): Promise<void>;
  private publishResult(...): void;
  private publishError(...): void;
}
```

### 4.4 `PaymentHandler` (`src/executor/payment-handler.ts`)

X402 결제 라이프사이클 전체를 캡슐화. 레퍼런스의 ~300줄 결제 코드를 재사용 가능한 클래스로 추출.

```typescript
class PaymentHandler {
  private readonly facilitator: ReturnType<typeof useFacilitator>;

  constructor(private readonly paymentConfigs: NormalizedPaymentConfig[]) {
    this.facilitator = useFacilitator();
  }

  /** Phase 1: PaymentRequirements를 클라이언트에 반환 */
  requestPayment(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus,
    userMessage: Message,
  ): void;

  /** Phase 2: 결제 검증, 정산 */
  async handlePaymentSubmission(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    metadata: Record<string, unknown>,
  ): Promise<{ success: true; receipt: PaymentReceipt } | { success: false }>;

  // Private helpers
  private failPayment(taskId, contextId, eventBus, network, errorCode, errorMessage): void;
  private recoverStoredRequirements(task?: Task): PaymentRequirements[];
  private findAcceptedRequirements(payload, storedRequirements): PaymentRequirements | null;
}
```

**결제 검증 순서** (레퍼런스와 동일):
1. PaymentPayload 구조 확인 (`payload.payload.authorization` 존재 여부)
2. 네트워크/스킴 매칭 (저장된 PaymentRequirements에서 찾기)
3. payTo 주소 일치 확인 (case-insensitive)
4. 금액 ≤ maxAmountRequired 확인
5. `facilitator.verify()` → 서명 검증
6. `facilitator.settle()` → 온체인 정산

### 4.5 원본 메시지 복원 (`src/executor/message-recovery.ts`)

결제 제출 메시지가 아닌, 사용자의 **원래 요청**을 execute 함수에 전달해야 함.

```typescript
/**
 * task.history를 탐색하여 프로토콜 메타데이터가 없는
 * 첫 번째 user 메시지를 찾아 반환.
 *
 * 프로토콜 메타데이터: x402.payment.status, x402.payment.payload
 */
export function recoverOriginalMessage(requestContext: RequestContext): Message {
  const { task, userMessage } = requestContext;
  const history = task?.history ?? [];

  const original = history.find(
    (m) => m.role === 'user' && !hasProtocolMetadata(m.metadata),
  );

  return (original as unknown as Message) ?? userMessage;
}
```

### 4.6 AgentCard 빌더 (`src/card/card-builder.ts`)

`AgentConfig` → `AgentCard` 변환. 결제 설정이 있으면 x402 extension 자동 추가.

```typescript
export function buildAgentCard(config: AgentConfig): AgentCard {
  const baseUrl = config.baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const a2aPath = config.a2aPath ?? '/api/a2a';

  const extensions: AgentExtension[] = [];
  if (config.payment) {
    extensions.push({
      uri: X402_EXTENSION_URI,
      description: 'Supports payments using the x402 protocol.',
      required: true,
    });
  }

  return {
    name: config.name,
    description: config.description,
    version: config.version,
    protocolVersion: config.protocolVersion ?? '0.3.0',
    url: `${baseUrl}${a2aPath}`,
    skills: config.skills.map(s => ({ ...s })),
    capabilities: {
      streaming: config.streaming ?? true,
      extensions: extensions.length > 0 ? extensions : undefined,
    },
    defaultInputModes: config.defaultInputModes ?? ['text/plain'],
    defaultOutputModes: config.defaultOutputModes ?? ['text/plain'],
    provider: config.provider,
  };
}
```

---

## 5. 프레임워크 어댑터

### 5.1 Next.js (`src/adapters/nextjs.ts`)

Web Request/Response API 사용. `next` 패키지에 직접 의존하지 않음.

```typescript
export function createNextjsHandlers(transportHandler: JsonRpcTransportHandler) {
  return {
    POST: async (req: Request): Promise<Response> => {
      const body = await req.json();
      const result = await transportHandler.handle(body);

      if (result && Symbol.asyncIterator in Object(result)) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            for await (const chunk of result as AsyncGenerator) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
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
```

### 5.2 Express (`src/adapters/express.ts`)

`@a2a-js/sdk/server/express`의 기존 미들웨어 활용. express는 dynamic require로 로드.

```typescript
export function createExpressHandlers(
  requestHandler: DefaultRequestHandler,
  agentCard: AgentCard,
) {
  return {
    router: () => {
      const { jsonRpcHandler, agentCardHandler, UserBuilder } = require('@a2a-js/sdk/server/express');
      const express = require('express');
      const router = express.Router();

      router.post('/api/a2a', express.json(), jsonRpcHandler({
        requestHandler,
        userBuilder: UserBuilder.noAuthentication(),
      }));

      router.get('/.well-known/agent.json', agentCardHandler({
        agentCardProvider: async () => agentCard,
      }));

      return router;
    },
  };
}
```

---

## 6. Agent Registry 연동 (`src/registry/registry-client.ts`)

```typescript
const DEFAULT_REGISTRY_URL = 'https://a2a-agent-registry.fly.dev';

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
    throw new A2xError('REGISTRY_ERROR',
      `Registration failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}
```

---

## 7. 상수 및 에러 정의

### 7.1 상수 (`src/constants.ts`)

```typescript
export const X402_EXTENSION_URI =
  'https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2';

export const X402_METADATA_KEYS = {
  STATUS: 'x402.payment.status',
  REQUIRED: 'x402.payment.required',
  PAYLOAD: 'x402.payment.payload',
  RECEIPTS: 'x402.payment.receipts',
  ERROR: 'x402.payment.error',
} as const;

export const USDC_ADDRESSES = {
  BASE_SEPOLIA: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  BASE_MAINNET: '0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913',
} as const;
```

### 7.2 에러 (`src/errors.ts`)

```typescript
export class A2xError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'A2xError';
  }
}

// X402 에러 코드 (프로토콜 스펙 기반)
export const X402ErrorCodes = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH',
  INVALID_PAY_TO: 'INVALID_PAY_TO',
  AMOUNT_EXCEEDED: 'AMOUNT_EXCEEDED',
  VERIFY_FAILED: 'VERIFY_FAILED',
  SETTLE_FAILED: 'SETTLE_FAILED',
} as const;
```

---

## 8. Public Exports (`src/index.ts`)

```typescript
export { createAgent } from './create-agent';

export type {
  AgentConfig,
  AgentInstance,
  SkillConfig,
  PaymentConfig,
  ExecuteContext,
  ExecuteResult,
  ExecuteFn,
  PaymentReceipt,
} from './types';

export { A2xError, X402ErrorCodes } from './errors';

export { USDC_ADDRESSES } from './constants';

// @a2a-js/sdk 타입 편의 re-export
export type { AgentCard, Message, Task, Part, TextPart, FilePart, DataPart } from '@a2a-js/sdk';
export type { TaskStore } from '@a2a-js/sdk/server';
```

---

## 9. 의존성 및 빌드

### 9.1 package.json

```json
{
  "name": "@a2x/sdk",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./nextjs": { "types": "./dist/adapters/nextjs.d.ts", "import": "./dist/adapters/nextjs.js" },
    "./express": { "types": "./dist/adapters/express.d.ts", "import": "./dist/adapters/express.js" }
  },
  "peerDependencies": {
    "@a2a-js/sdk": "^0.3.13",
    "x402": "^1.1.0"
  },
  "peerDependenciesMeta": {
    "x402": { "optional": true }
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0",
    "@a2a-js/sdk": "^0.3.13",
    "x402": "^1.1.0"
  }
}
```

- `@a2a-js/sdk`: **필수** peer dependency
- `x402`: **선택** peer dependency (payment 설정 시에만 필요)
- `next`, `express`: 의존하지 않음 (Web API 사용)

### 9.2 tsup.config.ts

```typescript
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/nextjs': 'src/adapters/nextjs.ts',
    'adapters/express': 'src/adapters/express.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@a2a-js/sdk', 'x402', 'next', 'express'],
});
```

---

## 10. 구현 순서

| 순서 | 파일 | 설명 | 의존성 |
|------|------|------|--------|
| 1 | `types.ts`, `constants.ts`, `errors.ts` | 기반 타입 정의 | 없음 |
| 2 | `card/card-builder.ts` | AgentCard 생성 | types, constants |
| 3 | `executor/message-recovery.ts` | 원본 메시지 복원 | constants |
| 4 | `executor/payment-handler.ts` | X402 결제 처리 | x402, constants, errors |
| 5 | `executor/a2x-executor.ts` | AgentExecutor 구현 | payment-handler, message-recovery |
| 6 | `agent.ts` | Agent 클래스 | types |
| 7 | `create-agent.ts` | 팩토리 함수 | 모든 모듈 |
| 8 | `adapters/nextjs.ts` | Next.js 어댑터 | types |
| 9 | `adapters/express.ts` | Express 어댑터 | types |
| 10 | `registry/registry-client.ts` | Registry 클라이언트 | errors |
| 11 | `index.ts` | Public API | 모든 모듈 |
| 12 | `__tests__/**` | 테스트 | vitest |
| 13 | `package.json`, `tsup.config.ts`, `tsconfig.json` | 빌드 설정 | - |

---

## 11. 핵심 설계 결정 사항

### 11.1 AI 런타임에 의존하지 않음
SDK는 Google ADK, LangChain 등 어떤 AI 프레임워크에도 의존하지 않음. `execute` 함수 내부에서 개발자가 자유롭게 선택.

### 11.2 Payment는 완전히 투명
개발자의 `execute` 함수는 **결제 완료 후에만** 호출됨. 결제 흐름(요청→검증→정산)은 SDK 내부에서 자동 처리.

### 11.3 스트리밍 응답 (v1 제한사항)
`{ stream: AsyncIterable<string> }` 반환 시, v1에서는 내부적으로 전체 수집 후 단일 Message로 발행. 향후 `TaskArtifactUpdateEvent`를 활용한 실시간 스트리밍 지원 예정.

### 11.4 x402 타입 호환성
레퍼런스 에이전트는 로컬 타입과 x402 패키지 타입 간 `as unknown` 캐스팅 필요. SDK는 x402 패키지의 Zod 추론 타입을 직접 사용하여 캐스팅 제거. `PaymentRequirements.description` 필드는 SDK가 기본값('Service fee') 제공.

### 11.5 Task History에서 PaymentRequirements 복원
PaymentHandler는 결제 검증 시 task.history에서 이전에 발행한 PaymentRequirements를 복원하여 검증에 사용. TaskStore가 리셋된 경우 현재 config로 폴백.

---

## 12. 검증 방법

### 빌드 검증
```bash
cd sdk/a2x-sdk && npm install && npm run build
```

### 단위 테스트
```bash
npm run test
```

### 통합 테스트
1. SDK로 간단한 에이전트 생성 (Next.js 프로젝트)
2. `a2x` CLI로 에이전트에 메시지 전송
3. 무료 에이전트: 즉시 응답 확인
4. 유료 에이전트: payment-required → payment-submitted → completed 흐름 확인
5. Agent Registry 등록 확인

### 레퍼런스 에이전트 재구현
SDK 검증의 최종 단계: GitHub Repo Analyzer를 SDK 기반으로 재구현하여 동일한 기능이 ~50줄 이내로 가능한지 확인.
