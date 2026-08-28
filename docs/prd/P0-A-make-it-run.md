---
id: P0-A
title: Make the service run, and make CI unable to hide it
tier: 0
status: draft
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

## Acceptance criteria

- [ ] `buildAgentGraph` returns a compiled graph; a unit test asserts this and fails if the
      channel/node collision is reintroduced.
- [ ] `POST /runs` against `apps/agent-service` returns 200 with a body satisfying
      `RunResponseSchema`.
- [ ] `POST /runs` against the gateway on port 3001 returns 200 and does not hang; the
      upstream receives the forwarded body and the `x-correlation-id` header.
- [ ] `POST /runs/stream` emits `text/event-stream` and at least one `data:` frame.
- [ ] `yarn turbo test:service` runs `apps/agent-service/test/runs.e2e-spec.ts` and passes.
- [ ] `ci.yml` invokes `test:service`; a separate workflow invokes `test:e2e` against the
      full compose stack.
- [ ] The README quickstart commands, executed verbatim against a fresh clone, succeed.

## Risks and open questions

- Renaming the `plan` channel touches the `AgentState` type surface. It is contained to
  `apps/agent-service`, but `packages/agent-contracts` should be checked for leakage of the
  field name into the response contract before the rename lands.
- The Playwright suite currently boots only the Vite dev server
  (`playwright.config.ts`), so its one behavioral assertion passes for the wrong reason.
  Pointing it at the compose stack may surface real failures. That is the intended outcome;
  budget for fixing what it finds.
- `docker compose --profile full` in CI is slower than the current service-container
  approach. If it proves too slow for every pull request, move it to a nightly schedule and
  keep `test:service` on the pull-request path.

## References

- LangGraph state and node naming: https://langchain-ai.github.io/langgraphjs/
- `fixRequestBody`: https://github.com/chimurai/http-proxy-middleware
