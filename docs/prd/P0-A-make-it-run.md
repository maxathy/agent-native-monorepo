---
id: P0-A
title: Make the service run, and make CI unable to hide it
tier: 0
status: shipped
size: S
depends_on: []
blocks: [P1-A, P2-A, P5-C]
issue: null
superseded_by: null
---

# P0-A · Make the service run, and make CI unable to hide it

## Problem

Two defects make the documented quickstart fail, and a third explains why neither was
caught.

**1. The compiled graph throws before it can be built.** `graph.ts:24` declares `plan` as a
state channel on `AgentStateAnnotation`; `graph.ts:41` registers a node also named `plan`.
LangGraph forbids the collision. Importing the built artifact and calling
`buildAgentGraph` produces:

```
Error: plan is already being used as a state attribute (a.k.a. a channel),
cannot also be used as a node name.
```

The throw happens inside `addNode`, so `graph.compile()` at `graph.ts:64` is never reached
and every `POST /runs` and `POST /runs/stream` returns 500.

**2. The gateway never finalizes a proxied POST.** `apps/gateway/src/server.ts:11` mounts
`express.json()` ahead of the proxy router at `:13`, and
`apps/gateway/src/routes/runs.route.ts` creates the proxy without a `fixRequestBody`
handler. body-parser consumes the request stream, so the upstream request is never
completed and the connection hangs until the client times out. `fixRequestBody` is exported
by the installed `http-proxy-middleware@3.0.7` and is currently unused. This is the port
that `README.md` tells a reader to curl, and the port the console's proxy target resolves
to.

**3. No test in any workflow executes the graph or issues an HTTP request.** The suite that
would have caught defect 1 already exists: `apps/agent-service/test/runs.e2e-spec.ts:36`
asserts `HttpStatus.OK` on `POST /runs`. It is run by `"test": "jest"`
(`apps/agent-service/package.json:14`), and `test` is not a task in `turbo.json`, so no
workflow invokes it. `apps/console`'s `"test:e2e": "playwright test"`
(`package.json:13`) is likewise absent from all five workflows. What CI does run —
`turbo test:unit` — collects exactly one file in `apps/agent-service`,
`src/agent/graph/edges.test.ts`, covering a pure routing function.

## Why it matters

The repository's own README, the architecture diagrams, and the summary line describing it
as a "stateful LangGraph agent chassis" all describe a six-node state machine that has
never executed. The CI badge is green over it. Anyone who follows the quickstart reaches a
500 or a hang inside two minutes.

Everything else in this backlog assumes a running agent. This PRD is the precondition for
Tier 1 and Tier 2.

## Scope

- Resolve the channel/node name collision.
- Add `fixRequestBody` to the gateway proxy.
- Promote the existing Jest service spec into a Turborepo task and run it in CI.
- Run the existing Playwright suite in CI against a stack that actually serves requests.
- Add a regression test that fails if the graph stops building.

### Non-goals

- Consolidating the split Jest/Vitest runners in `apps/agent-service`. That migration
  belongs with P1-A, which establishes Vitest as the evaluation runner.
- Wiring the real memory adapters — the graph will still run against the stub dependency
  set. That is P2-A.
- Correcting documentation claims beyond the two defects here. That is P0-B.

## Design

**Collision.** Rename the state channel, not the node. Node names are public vocabulary:
they appear in SSE `StreamEvent.node` payloads, in OTel span names (`agent.node.plan`), in
the README topology diagram, and in `.context/architecture.md`. The state field is internal
to `AgentState`. Rename `plan` → `currentPlan` in `graph/state.ts`, `graph/graph.ts:24`,
`nodes/plan.node.ts`, and any reader in `nodes/act.node.ts` and `nodes/egress.node.ts`.
(On implementation: `egress.node.ts` does not read the field — `act.node.ts` is the only
reader. `packages/memory-core` does declare it, and is the file this list was missing.)

**Gateway.** Import `fixRequestBody` from `http-proxy-middleware` and attach it to the
existing `on.proxyReq` handler alongside the correlation-ID forwarding, so both behaviors
are preserved:

```ts
on: {
  proxyReq: (proxyReq, req, res) => {
    const correlationId = req.headers['x-correlation-id'];
    if (correlationId) proxyReq.setHeader('x-correlation-id', correlationId as string);
    fixRequestBody(proxyReq, req);
  },
},
```

Note for review: `fixRequestBody` re-serializes the parsed body. SSE responses are
unaffected because the fix applies to the request, not the response.

**CI.** Add a `test:service` task to `turbo.json` (`dependsOn: ["build"]`, `cache: false`),
rename the agent-service `test` script to `test:service`, and add `yarn turbo test:service`
to `ci.yml` after `test:unit`. Add a separate job running `turbo test:e2e` against
`docker compose --profile full up`, which is what `.context/conventions.md` already claims
the Playwright suite does.

**Regression test.** A unit test calling `buildAgentGraph` with stub dependencies and
asserting it returns a compiled graph. This is the specific assertion whose absence allowed
defect 1 to ship; it runs in `test:unit` and costs nothing.

### What implementation added to this design

The two defects above were real and fixed as written. Four more sat behind them, each
found only once the one in front of it was cleared. They are recorded here because the
next reader will otherwise assume this PRD's Problem section was the whole story.

- The gateway needed a second fix. With the hang cleared, `/runs` reached the agent service
  as `/`: an Express mount path is stripped from `req.url` before the middleware sees it,
  so `pathRewrite: { '^/runs': '/runs' }` matched nothing and was a no-op that looked
  deliberate. Selection moved to `pathFilter`.
- The Jest spec could not start: `jest.config.ts` requires `ts-node`, which is not a
  dependency, and ESM needs `--experimental-vm-modules`. The claim that `"test": "jest"`
  ran it was true only in the sense that the script existed.
- `GlobalHttpExceptionFilter` rebuilt every response body from scratch, discarding the
  `error: 'Validation Error'` and `issues` that `ZodValidationPipe` had attached — so the
  spec's 400 assertion failed against the shape the pipe was written to produce.
- `yarn dev` was broken independently of everything else: it runs through tsx, esbuild does
  not implement `emitDecoratorMetadata`, and Nest injected `undefined` into the one
  constructor in the service. The compiled path was unaffected, which is why the e2e spec
  passed while the documented quickstart did not.

## Acceptance criteria

- [x] `buildAgentGraph` returns a compiled graph; a unit test asserts this and fails if the
      channel/node collision is reintroduced.
- [x] `POST /runs` against `apps/agent-service` returns 200 with a body satisfying
      `RunResponseSchema`.
- [x] `POST /runs` against the gateway on port 3001 returns 200 and does not hang; the
      upstream receives the forwarded body and the `x-correlation-id` header.
- [x] `POST /runs/stream` emits `text/event-stream` and at least one `data:` frame.
- [x] `yarn turbo test:service` runs `apps/agent-service/test/runs.e2e-spec.ts` and passes.
- [x] `ci.yml` invokes `test:service`; a separate workflow invokes `test:e2e` against the
      full compose stack.
- [x] The README quickstart commands succeed against a fresh clone with no `.env`, which is
      the state the command block alone assumes.
- [ ] The README quickstart succeeds on the path the Prerequisites section documents —
      `cp .env.example .env` with a `GOOGLE_API_KEY` set. It returns 500: `text-embedding-004`
      is retired, and its replacement changes the embedding dimension that
      `pgvector.writer.ts`, `retrieval-facade.ts`, and `seed-eval-fixtures.mjs` hardcode as 768. Deferred to P2-A, which owns the dependency set. Until it lands the README must
      not tell a reader to set a key that produces a 500; reordering that section is P0-B's.

## Risks and open questions

Resolved during implementation:

- **The `plan` rename did not leak into `packages/agent-contracts`.** The only `plan` there
  is `node: 'plan'` in a `StreamEvent` fixture, which is the node name and does not move.
  The field did live in `packages/memory-core` — `WorkingMemorySchema`, which
  `AgentStateSchema` extends — so both were renamed together. Renaming only the local
  extend would have left a ghost `plan` on `AgentState` that still compiled and always read
  `undefined`.
- **Pointing Playwright at the compose stack surfaced no browser failures**, because the
  stack could not start at all. Four defects stood between `docker compose --profile full
up` and a running console: the runner images omitted `packages/`, which every workspace
  symlink points into; an empty `OTEL_EXPORTER_OTLP_ENDPOINT` built the invalid exporter
  URL `/v1/traces` and killed bootstrap; the fatal was logged as `"error":{}` because pino
  has no error serializer by default; and the console healthcheck polled `localhost`, which
  is `::1`, against an nginx bound to IPv4 only. All five assertions pass once the stack
  runs.
- **`docker compose --profile full` cost.** The job builds three images and waits on six
  healthchecks; locally that is a few minutes from cold. It is on the pull-request path
  for now. If it becomes the slowest gate, move it to a schedule and keep `test:service` on
  every pull request.

Open, and handed on:

- **The Gemini dependency set is still broken, and it is P2-A's.** With `GOOGLE_API_KEY`
  set — which the README's prerequisites tell every reader to do — `POST /runs` returns
  500: `text-embedding-004` no longer exists for `embedContent` on `v1beta`. The
  replacement is not a one-line change, because 768 dimensions are hardcoded in
  `pgvector.writer.ts` (both the Zod validator and the `vector(768)` DDL),
  `retrieval-facade.ts`, `scripts/seed-eval-fixtures.mjs`, and documented in `README.md`
  and `.context/architecture.md`. Picking a replacement model is a dimension decision, so
  it belongs with wiring the real memory adapters. Everything in this PRD was verified
  against the stub dependency set, which is what CI runs.
- **`POST /runs/stream` answers 201, not 200**, because the handler has no `@HttpCode(200)`
  while `POST /runs` does. No contract or document states either, so nothing is violated;
  it is worth settling when `StreamEvent` is next touched.

## References

- LangGraph state and node naming: https://langchain-ai.github.io/langgraphjs/
- `fixRequestBody`: https://github.com/chimurai/http-proxy-middleware
