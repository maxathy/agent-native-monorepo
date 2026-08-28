# Product Requirement Docs

## Where things stand

_Last updated 2026-08-28. If this section is more than a few weeks stale, trust the code
over it and update it._

**The service runs now.** [P0-A](P0-A-make-it-run.md) is shipped. `POST /runs` returns a
`RunResponse` and `POST /runs/stream` emits a frame per node, both directly and through the
gateway, and both README quickstart curls succeed against a clone with no `.env`.
`docker compose --profile full up` reaches five healthy containers — six when P0-A shipped,
before P0-B removed the Redis nothing connected to.

**P0-A was not the two one-line fixes it was scoped as.** The channel/node collision and
the missing `fixRequestBody` were both real, and behind them were six more defects, each
visible only once the one in front of it was cleared: a no-op `pathRewrite` that sent
`/runs` upstream as `/`, a Jest config that required an uninstalled `ts-node`, an exception
filter that discarded the validation payload the pipe attached, Docker images missing the
`packages/` tree their symlinks point into, an empty `OTEL_EXPORTER_OTLP_ENDPOINT` that
built an invalid exporter URL and killed bootstrap, and `yarn dev` injecting `undefined`
into the one Nest constructor because esbuild does not emit decorator metadata. The lesson
for the remaining PRDs: a defect found by reading is one defect, and the count is only
known after the thing runs.

**CI can no longer hide a broken service.** `ci.yml` runs `turbo test:service`, which boots
a Nest app and asserts the response against `RunResponseSchema`. A second job in `e2e.yml`
runs Playwright against the console container from `docker compose --profile full`, rather
than the Vite dev server with nothing behind it. A unit test calls `buildAgentGraph` and
fails if the channel collision returns.

**The documentation now says what the code does, and `docs/STATUS.md` is where it says
it.** [P0-B](P0-B-reconcile-claims.md) is shipped. The matrix carries sixteen rows — the
fifteen from its inventory plus the retired embedding model — each with a status, a file
and a line, and the PRD that owns the rest. Eight of those rows are the same piece of work:
`packages/memory-core` is a set of tested adapters that `apps/agent-service` never
constructs, and P2-A is what constructs them. Redis is gone from compose, CI and
`.env.example`; Node is pinned to 24 in the README, all five workflows and all three
images; and the testcontainers convention the repository never followed is out of
`.context/` and `.agents/`.

**Read `docs/STATUS.md` before trusting a capability sentence anywhere else.** It is the
file this tier exists to produce, and the rule that keeps it current is in
`.context/conventions.md` and `.agents/reviewer.md`: a change that moves a row moves it
there in the same pull request.

**One live defect is parked, not fixed.** With a `GOOGLE_API_KEY` set, `POST /runs`
returns 500 and `POST /runs/stream` stops after the `ingress` frame — `text-embedding-004`
is retired. The replacement changes the embedding dimension, and 768 is hardcoded in
`pgvector.writer.ts`, `retrieval-facade.ts`, and `scripts/seed-eval-fixtures.mjs`. That
makes it P2-A's. The README no longer instructs anyone to set the key, and it is row 16 of
`docs/STATUS.md`.

**Suggested next step:** P1-A or P2-A, and the choice is about what the repository should
prove next. P2-A retires eight `stubbed` rows and turns the architecture from a design into
a running system; P1-A is the stated thesis and the harder thing to fake. P2-A is the more
honest order — evaluating a graph whose memory tiers are no-ops measures the stub — but
P1-A is the one a reader came for. Neither is small.

**One decision is pending and blocks Tier 3:** `.agents/reviewer.md` rule 10 forbids
medical and clinical terminology, which rules out the payer-domain vertical. It needs an
ADR, not a unilateral edit. See P0-B, "Risks and open questions."

---

This directory is the backlog. Each PRD is one file with YAML frontmatter; the frontmatter
is the machine-readable part (`status`, `size`, `depends_on`, `issue`) and the body is the
argument for why the work is worth doing.

## How this works

- **This index is the source of truth for the backlog.** Every planned change lives here,
  whether or not it has a GitHub issue.
- **GitHub issues are the tracking layer, not the content layer.** An issue is opened only
  when work on a PRD actually starts; its body is a link plus acceptance criteria. This
  keeps the tracker a picture of momentum rather than a pile of stale intentions.
- **Tiers map to milestones.** They are thematic, not time-boxed.
- **Sub-issues decompose a PRD into tasks** — never a tier into PRDs. Tier→PRD is a
  taxonomy and lives here; PRD→task is a work breakdown and lives in GitHub.
- **Changes arrive as pull requests.** `git log -p docs/prd/<file>` is the record of how the
  thinking changed, which is the whole reason these are files and not issue bodies.

Status values: `draft` → `accepted` → `in-progress` → `shipped` → `superseded`.
Sizes: `S` ≈ 1–2 days, `M` ≈ 3–5 days, `L` ≈ 1–2 weeks.

## Tier 0 — Truth alignment

The repository documented capabilities it did not have, and did not run. Both are closed:
the service runs and CI proves it, and `docs/STATUS.md` records what every documented
capability is actually backed by. This tier is done — keeping the matrix true is now a
standing rule in `.context/conventions.md`, not a piece of work.

| ID                               | Title                                                 | Size | Status  |
| -------------------------------- | ----------------------------------------------------- | ---- | ------- |
| [P0-A](P0-A-make-it-run.md)      | Make the service run, and make CI unable to hide it   | S    | shipped |
| [P0-B](P0-B-reconcile-claims.md) | Reconcile documented claims with implemented behavior | M    | shipped |

## Tier 1 — Evaluation in CI

The repository's stated thesis. Today `.github/workflows/agent-eval.yml` runs
`yarn turbo test:eval`, which resolves to a single integration suite in
`packages/memory-core` that never invokes the agent.

| ID                           | Title                                                         | Size | Status |
| ---------------------------- | ------------------------------------------------------------- | ---- | ------ |
| [P1-A](P1-A-eval-harness.md) | `packages/eval-harness` — evaluation as a first-class package | L    | draft  |
| P1-B                         | `packages/agent-cassette` — decision-level record and replay  | M    | draft  |
| P1-C                         | Tiered evaluation pipeline replacing the nightly stub         | M    | draft  |
| P1-D                         | Statistical regression gate with paired bootstrap             | M    | draft  |
| P1-E                         | Model-drift canary against pinned and floating model ids      | S    | draft  |
| P1-F                         | Cost, latency, and step budgets as CI assertions              | S    | draft  |

## Tier 2 — Make the architecture real

The three-tier memory model exists in `packages/memory-core` and is never instantiated by
`apps/agent-service`. The graph compiles without a checkpointer.

| ID   | Title                                                            | Size | Status |
| ---- | ---------------------------------------------------------------- | ---- | ------ |
| P2-A | Wire memory-core into the service; add checkpointing and retry   | L    | draft  |
| P2-B | Hybrid retrieval evaluation and the graph/vector/hybrid ablation | M    | draft  |
| P2-C | OpenTelemetry GenAI semantics, including evaluation events       | M    | draft  |

## Tier 3 — Regulated-domain credibility

Optional vertical. Demonstrates that the chassis holds up under the constraints a payer or
provider actually operates under. Uses synthetic data only.

| ID   | Title                                                        | Size | Status |
| ---- | ------------------------------------------------------------ | ---- | ------ |
| P3-A | Clinician-gate invariant enforced in the type system         | S    | draft  |
| P3-B | Deterministic replay for audit reconstruction                | M    | draft  |
| P3-C | Hash-chained, tamper-evident decision ledger                 | M    | draft  |
| P3-D | Synthetic payer dataset and FHIR prior-authorization surface | L    | draft  |

## Tier 4 — Governance and agent security as code

| ID   | Title                                                           | Size | Status |
| ---- | --------------------------------------------------------------- | ---- | ------ |
| P4-A | `governance/controls.yaml` and a CI check for unmapped controls | M    | draft  |
| P4-B | Memory-poisoning red team mapped to OWASP Agentic Top 10        | M    | draft  |
| P4-C | Reversibility-tiered tool registry with saga compensation       | M    | draft  |

## Tier 5 — Interoperability

| ID   | Title                                            | Size | Status |
| ---- | ------------------------------------------------ | ---- | ------ |
| P5-A | Agent2Agent v1.0 server with a signed Agent Card | M    | draft  |
| P5-B | Agent Development Kit portability appendix       | S    | draft  |
| P5-C | Upgrade to LangGraph 1.x                         | S    | draft  |

## Sequencing

The dependency spine, not a schedule:

```
P0-A ──▶ P5-C ──▶ P2-A ──┬──▶ P2-B
                          ├──▶ P3-B
                          └──▶ P4-C
P0-A ──▶ P1-A ──▶ P1-B ──▶ P1-C ──┬──▶ P1-D
                                   ├──▶ P1-E
                                   └──▶ P1-F
```

`P0-B`, `P2-C`, `P3-A`, `P3-C`, `P4-A`, `P4-B`, `P5-A`, and `P5-B` have no hard
predecessors and can be picked up whenever they are the most valuable next thing.
