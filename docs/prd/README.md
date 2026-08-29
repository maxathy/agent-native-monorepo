# Product Requirement Docs

## Where things stand

_Last updated 2026-08-29. If this section is more than a few weeks stale, trust the code
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

**[P2-A](P2-A-wire-memory-core.md) is shipped, and the architecture is a running system
rather than a design.** `MemoryModule` constructs the pool, the driver, the four adapters,
the facade and the checkpointer; `RunsService` injects them. Verified against live stores
from an empty database: one `POST /runs` migrates, boots, and leaves two `episodes` rows,
one `:Concept`, one `:Fact`, one `semantic_facts` row and nine checkpoints under the runId
its own response returned. Rows 1, 2, 3, 6, 13 and 15 of `docs/STATUS.md` are
`implemented`.

**Memory is a second axis, and it does not fall back.** `GOOGLE_API_KEY` selects the model
half; `DATABASE_URL` + `NEO4J_URI` select the memory half. Configured-but-unreachable exits
1 in about a second with a message naming the cause — an unreachable Postgres, an
unreachable Neo4j, or a half-written `.env`. Selecting no-op writers because a configured
database is missing was the defect; it is not reachable as a runtime path. The
no-database path is untouched, because a clone with no `.env` still has to serve both
quickstart curls.

**Implementation found two defects that reading had not.** `ingress` still minted its own
`runId`, so every run was checkpointed under an identifier that appeared nowhere in its own
response — nine checkpoint rows on a thread the caller could not name, and a resume that
could never be asked for. And a half-configured memory axis produced SIGABRT, exit 134 and
a core dump rather than a message, because Nest aborts the process when a provider factory
throws. P0-A's lesson holds: a defect found by reading is one defect, and the count is only
known after the thing runs.

**Fusion landed here, so P2-D is gone from the index rather than left as a ghost.** The
graph now stores facts as well as concepts — `(:Fact)-[:MENTIONS]->(:Concept)`, keyed on
the same content hash pgvector uses — so both retrievers draw from one candidate universe
and a fact found by both paths is scored at the sum of its two reciprocal ranks. That
changes ADR 0002's account of why fusion failed, which blamed the key; the key was a
symptom. [ADR 0004](../adr/0004-one-candidate-universe-for-fusion.md) records the decision
without superseding 0002's still-correct choice to run both stores.

**P2-A shipped, was reopened the same day, and shipped again. All twenty-four criteria are
met.** Two ticks were wrong, for one shared reason: acceptance was verified on the stub
model axis and the live model axis was never exercised. The block was environmental —
nothing on the Node path read `.env`, so a revoked key exported from a shell rc shadowed the
valid one in the file, and every live call returned `403`. That was recorded as a credential
problem owned by P1-E. It was not.

With a working key the live axis exposed a defect the stub axis structurally could not.
`distill` parsed the model response with `try { JSON.parse(...) } catch { return
EMPTY_EXTRACTION }`, and `gemini-2.5-flash` fences JSON unless
`responseMimeType: application/json` is set — so every live extraction threw, every catch
returned an empty set, and `reflect` wrote none of it while the run reported
`outcome: "success"`. The same defect class this PRD exists to remove, in the axis nobody
was watching. Both are fixed: the service reads `.env` and names any variable the
environment shadows, and a malformed extraction now throws an error the retry policy
retries. Verified live — one run writes 18 facts at 768 dimensions and L2 norm exactly
`1.000000`, 22 `:Concept` and 18 `:Fact`. Row 16 is `implemented`.

**The rule that came out of it: a criterion verified on a stub is verified against the half
of the system that cannot fail.** Where a PRD names two independent axes, its criteria have
to say which axis they were checked on. That is now in `.agents/prd-author.md`.

**A written convention had to move, not just the code.** `.context/conventions.md` said
containing failure inside the node was the intent and told the next reader not to widen the
gap. A `retryPolicy` only ever fires on a thrown error, so that goal and retry cannot both
hold: a node that swallows its own I/O failure makes the policy a decoration. The
convention now separates throwing from swallowing — I/O nodes throw, and containment
happens once at the graph boundary, which for a stream means a terminal `StreamEvent.error`
frame because the response is already committed.

**Suggested next step: P1-A.** It is the stated thesis and the one a reader came for, and
it is no longer downstream of a stub — its fourth acceptance criterion asserts that
`reflect` wrote an episodic row and MERGEd an entity, and both now happen. P2-B is the
other candidate: ADR 0002 is provisional until its ablation measures whether hybrid beats
either store alone, and that measurement is only meaningful now that fusion fuses.

**Tier 3 is unblocked.** `.agents/reviewer.md` rule 10 used to forbid medical and clinical
terminology, which ruled out the payer-domain vertical. [ADR
0003](../adr/0003-payer-domain-with-licensing-and-phi-as-the-boundary.md) replaces it: the
boundary is licensed content, real data and implied clinical authority, not vocabulary. The
sharp edge is that CPT is AMA-licensed and HCPCS Level I _is_ CPT, so it can never enter
this repository; ICD-10-CM and HCPCS Level II can. P3-A through P3-D can be drafted against
a real domain.

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

The three-tier memory model is instantiated and the graph is checkpointed. What remains is
measuring whether the hybrid premise holds, and saying so in the standard vocabulary.

| ID                               | Title                                                            | Size | Status  |
| -------------------------------- | ---------------------------------------------------------------- | ---- | ------- |
| [P2-A](P2-A-wire-memory-core.md) | Wire memory-core into the service; add checkpointing and retry   | L    | shipped |
| P2-B                             | Hybrid retrieval evaluation and the graph/vector/hybrid ablation | M    | draft   |
| P2-C                             | OpenTelemetry GenAI semantics, including evaluation events       | M    | draft   |

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
P0-A ──▶ P2-A ──┬──▶ P1-A ──▶ P1-B ──▶ P1-C ──┬──▶ P1-D
                │                              ├──▶ P1-E
                │                              └──▶ P1-F
                ├──▶ P2-B
                ├──▶ P3-B
                └──▶ P4-C
```

P2-A is shipped, so everything hanging off it is unblocked. P1-A also blocks P2-B: the
ablation needs both a working retrieval path and a harness to measure it with.

`P0-B`, `P2-C`, `P3-A`, `P3-C`, `P4-A`, `P4-B`, `P5-A`, `P5-B`, and `P5-C` have no hard
predecessors and can be picked up whenever they are the most valuable next thing. P5-C
was previously drawn as a predecessor of P2-A; it is not one. `retryPolicy`,
`compile({ checkpointer })`, and a peer-compatible
`@langchain/langgraph-checkpoint-postgres@0.1.3` are all available at the pinned
`@langchain/langgraph@0.4.10`.
