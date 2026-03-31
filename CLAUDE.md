# @a2x/sdk

A2A + X402 에이전트를 최소 보일러플레이트로 만드는 TypeScript SDK.

## 구조

```
src/
├── index.ts              # Public API exports
├── create-agent.ts       # createAgent() 팩토리
├── agent.ts              # Agent 클래스
├── types.ts              # Public 타입
├── constants.ts          # 프로토콜 상수
├── errors.ts             # A2xError
├── utils.ts              # 공유 유틸리티
├── executor/             # 실행 엔진 (Data/Service)
├── card/                 # AgentCard 빌더
├── adapters/             # Next.js, Express 어댑터
└── registry/             # Registry 클라이언트
```

## 명령어

```bash
npm run build       # tsup (ESM + CJS + .d.ts)
npm test            # vitest run
npm run typecheck   # tsc --noEmit
npm run dev         # tsup --watch
```

## 엔트리포인트

| Import path | 파일 | 용도 |
|---|---|---|
| `@a2x/sdk` | `src/index.ts` | createAgent, 타입, 에러 |
| `@a2x/sdk/nextjs` | `src/adapters/nextjs.ts` | Next.js App Router 어댑터 |
| `@a2x/sdk/express` | `src/adapters/express.ts` | Express 어댑터 |

## 규칙

- 구현 명세는 `SPEC.md` 참조
- 외부 프로토콜 의존성(`@a2a-js/sdk`, `x402`)은 peerDependencies
- Public API 변경 시 `types.ts` + `index.ts` exports 동시 업데이트
