---
id: P1-A
title: packages/eval-harness — evaluation as a first-class package
tier: 1
status: draft
size: L
depends_on: [P0-A, P2-A]
blocks: [P1-B, P1-C, P1-D, P1-E, P1-F, P2-B]
issue: null
superseded_by: null
---

# P1-A · `packages/eval-harness` — evaluation as a first-class package

## Problem

There is no evaluation of the agent anywhere in this repository.

`.github/workflows/agent-eval.yml` provisions Postgres and Neo4j, seeds fixtures, and runs
`yarn turbo test:eval`. Exactly one workspace declares that script —
`packages/memory-core/package.json:15` — and its value is
`REQUIRE_INTEGRATION_ENV=1 vitest run --config vitest.integration.config.ts`, which is the
integration suite with a flag prepended. The agent is never invoked. The workflow is green
and measures nothing about agent behavior.

A dataset shape already exists and is half-abandoned.
`apps/agent-service/test/fixtures/run-fixture-001.json` defines `input`, `expectedSeeds`,
`expectedOutcome: "success"`, and an `assertions` block
(`retrievedContextMinLength`, `outcomeMustBe`, `tokenCountsPositive`).
`scripts/seed-eval-fixtures.mjs:51` reads `expectedSeeds` and nothing else. The expected
outcome and the assertions are inert.

## Why it matters

This package is the repository's stated thesis, and the thing it currently lacks most
visibly. Reviewers of AI-engineering take-homes report that not starting with evaluation is
a disqualifying signal, and senior interview loops increasingly center the system-design
round on the evaluation harness rather than the retrieval architecture.

It is also the dependency root for the rest of Tier 1: the cassette layer (P1-B), the CI
pipeline (P1-C), the statistical gate (P1-D), the drift canary (P1-E), and the budget
assertions (P1-F) are all consumers of the types defined here, as is the retrieval
ablation in P2-B.

## Scope

- A new workspace, `packages/eval-harness`, exporting the core evaluation types and runner.
- Grader implementations: deterministic/code, model-graded, and human-label import.
- Outcome assertions that read persisted state, not response text.
- Trajectory scoring over the graph's node sequence and tool calls.
- Reporters: JSON, JUnit XML, and a GitHub job-summary Markdown table.
- Migration of `run-fixture-001.json` into the dataset format, with its dormant
  `assertions` block becoming executable.

### Non-goals

- Zero-cost replay. Every trial in this PRD makes real model calls. Making the pull-request
  path free is P1-B.
- Wiring into CI. This PRD delivers a package and a local `yarn eval` command; the tiered
  pipeline is P1-C.
- Statistical gating and baseline comparison. That is P1-D.
- Retrieval-quality metrics (`Recall@k`, `nDCG`, `MRR`). Those are P2-B, built on the
  `Grader` interface defined here.

## Design

### Vocabulary

The type names follow the vocabulary used in published agent-evaluation practice, so the
package reads as familiar rather than bespoke:

| Type           | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `Task`         | One evaluable scenario: input, seed state, and graders.                  |
| `Trial`        | One execution of a task. Agents are stochastic, so tasks run _n_ trials. |
| `AgentHarness` | Adapter that runs the system under test and returns a transcript.        |
| `EvalHarness`  | Loads tasks, resets the environment, runs trials, aggregates.            |
| `Transcript`   | The full record of a trial: messages, node sequence, tool calls, spans.  |
| `Outcome`      | The environment state _after_ the trial.                                 |
| `Grader`       | `(transcript, outcome) => Score`.                                        |
| `Suite`        | A named collection of tasks with shared configuration.                   |

### The load-bearing decision: grade the outcome

A grader receives both the transcript and the outcome, and the default graders assert
against the outcome. For this system that means querying Postgres, Neo4j, and pgvector
after the run — did `reflect` actually write the episode, MERGE the entity, upsert the
fact — rather than pattern-matching the assistant's final message. An agent can produce
a plausible answer while writing nothing, and only outcome assertions catch that.

```ts
export interface Grader<TOutcome = unknown> {
  readonly name: string;
  readonly kind: 'code' | 'model' | 'human';
  grade(transcript: Transcript, outcome: TOutcome): Promise<Score>;
}

export interface Score {
  readonly value: number; // normalized 0..1
  readonly label: 'pass' | 'fail';
  readonly explanation?: string; // required for kind === 'model'
}
```

`Score` is deliberately shaped to match the OpenTelemetry GenAI evaluation attributes
(`gen_ai.evaluation.score.value`, `.score.label`, `.explanation`) so P2-C can emit these
as span events without a translation layer.

### Binary by default

Graders return `pass` / `fail`, not a 1–5 scale. Ordinal rubrics produce inconsistent
labels across annotators and across judge runs. Where finer resolution is genuinely needed,
decompose into several binary sub-graders and report the fraction satisfied.

### Reliability reporting

The runner executes _n_ trials per task (default 5) and reports both:

- **`pass@k`** — at least one of k trials passed. Capability.
- **`pass^k`** — all k trials passed. Reliability.

`pass^k` decays as `p^k`, which is the point: it exposes the gap between "can do this" and
"does this dependably," and it is the number that matters for anything that touches
memory writes.

### Trajectory scoring

Beyond the final outcome, a `TrajectoryGrader` scores the node sequence and tool calls
against a reference, using the metric names that have become the common vocabulary:
`trajectory_exact_match`, `trajectory_in_order_match`, `trajectory_any_order_match`,
`trajectory_precision`, `trajectory_recall`. An agent can make every tool call correctly and
still fail the task, and it can reach the right answer through a wasteful path; these are
separate failure modes and need separate numbers.

### Model graders

Model-graded tasks must declare a judge model from a **different family** than the system
under test, to avoid self-preference bias. The package refuses to run a model grader whose
provider matches the agent's provider unless the task sets
`allowSameFamilyJudge: true` with a written justification.

Judges are validated, not trusted: a `human` grader kind exists so labeled examples can be
imported and a judge's true-positive and true-negative rates measured against them. A judge
with no calibration set is reported as uncalibrated in the summary output.

### Layout

```
packages/eval-harness/
  src/
    types.ts          Task, Trial, Transcript, Outcome, Grader, Score, Suite
    harness.ts        EvalHarness: load → reset → run n trials → aggregate
    graders/
      code.ts         assertion-based graders over Outcome
      model.ts        judge-backed graders, family check, calibration report
      trajectory.ts   node-sequence and tool-call metrics
    reporters/
      json.ts
      junit.ts        for CI test-report ingestion
      summary.ts      GitHub job-summary Markdown
    index.ts
  datasets/
    memory-recall/    tasks migrated from test/fixtures
  package.json
  vitest.config.ts
```

Runner is Vitest, consistent with `.context/conventions.md` and with the direction
`apps/agent-service` should consolidate toward.

### Dataset format

Supersedes the current fixture shape while preserving it. `expectedSeeds` is retained
as-is so `scripts/seed-eval-fixtures.mjs` continues to work, and the dormant `assertions`
block becomes a list of named code graders.

## Acceptance criteria

- [ ] `packages/eval-harness` exists, is in the workspaces glob, builds, typechecks, and
      lints.
- [ ] `Task`, `Trial`, `Transcript`, `Outcome`, `Grader`, `Score`, and `Suite` are exported
      from the package root.
- [ ] `run-fixture-001.json` is migrated to a `Task`, and its three dormant assertions run
      as code graders.
- [ ] At least one code grader asserts against persisted state — that `reflect` wrote an
      episodic row and MERGEd an entity — not against response text.
- [ ] The runner executes n trials per task and reports `pass@k` and `pass^k`.
- [ ] A trajectory grader reports precision and recall over the node sequence.
- [ ] A model grader refuses to run same-family judging without explicit opt-in.
- [ ] `yarn eval` runs the suite locally and writes JSON, JUnit XML, and a Markdown summary.
- [ ] `Score` field names map one-to-one onto `gen_ai.evaluation.*` attributes.
- [ ] The package README states the current pass rate and does not round it up.

## Risks and open questions

- **This PRD cannot complete before P2-A.** Its fourth acceptance criterion requires a
  grader asserting that `reflect` wrote an episodic row and MERGEd an entity. Those writers
  are no-op closures in `runs.service.ts` until P2-A wires the real adapters, so the
  criterion would be asserting against a stub. The types, runner, reporters and trajectory
  grading can all be built first; the outcome graders are what block.
- **Cost.** Every trial is a live model call, and n trials multiply it. Keep the initial
  suite small (10–20 tasks) and accept that the full suite is a nightly artifact until
  P1-B makes replay free.
- **A 100% pass rate means the suite is too easy.** If the first run passes everything,
  the tasks are wrong, not the agent. Add failing cases until the rate is meaningfully
  below 100%.
- **Environment reset between trials.** Postgres and Neo4j carry state across trials, and
  `reflect` writes are idempotent by content hash, so a second trial may read the first
  trial's writes. The harness must truncate between trials; this needs to be explicit in
  `EvalHarness`, not left to the task author.
- **Open question:** whether to depend on LangSmith's Vitest integration for the backend or
  keep the package standalone with pluggable reporters. Standalone first — it keeps the
  package honest about what it computes itself — with a LangSmith reporter as a later
  addition. Worth revisiting once P1-D needs baseline storage.
- **Vitest in `apps/agent-service` collects `dist/` as well as `src/`.** `test:unit` runs
  every unit test twice — once from `src/agent/graph/edges.test.ts` and again from the
  compiled `dist/agent/graph/edges.test.js`, because `tsc --build` emits test files and
  Vitest 4's default excludes no longer cover `dist`. Found while implementing P0-A and
  left alone: it wastes time and could report a stale compiled copy as a pass, but nothing
  is currently hidden by it, and this PRD owns the runner configuration for that package
  (see P0-A's non-goals). Fix it with an `exclude` when Vitest becomes the evaluation
  runner, or by keeping test files out of `rootDir`.

## References

- OpenTelemetry GenAI evaluation attributes:
  https://github.com/open-telemetry/semantic-conventions-genai
- `pass^k` as a reliability metric: τ-bench, https://github.com/sierra-research/tau2-bench
- Practitioner guidance on binary rubrics and judge calibration:
  https://hamel.dev/blog/posts/evals-faq/
