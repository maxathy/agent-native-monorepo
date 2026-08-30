# 0001 · LangGraph over a durable execution engine

**Status:** accepted
**Date:** 2026-08-28

## Context

The agent is a multi-step loop with side effects: it reads from two stores, calls a model
several times per run, executes tools, and writes to Postgres, Neo4j, and pgvector. Runs
can fail partway. Something has to define what happens on restart.

The candidates were LangGraph's own checkpointer, and a dedicated durable execution engine
— Temporal, Restate, or DBOS — with the graph reduced to an activity.

## Decision

Use LangGraph with `@langchain/langgraph-checkpoint-postgres` as the persistence layer.
Do not introduce a workflow engine.

The deciding factor is operational surface area relative to what this system actually
needs. Temporal requires a separate cluster to operate and is built for workflows measured
in days or weeks; agent runs here are measured in seconds. DBOS would fit the Postgres-only
constraint well, but it wants to own the execution model, which conflicts with LangGraph
owning the graph. The checkpointer reuses the Postgres instance already provisioned for
episodic memory.

## Consequences

**What this buys.** State persisted after every node; resume after process restart; state
history and time-travel debugging, which is the substrate P3-B's audit replay is built on;
`interrupt()` for human-in-the-loop pauses.

**What this does not buy, and the distinction matters.** Checkpointing is not durable
execution. It gives state persistence and resume. It does not give exactly-once side
effects, distributed retry with backoff, or durable timers. If a node writes to Neo4j and
then crashes, the checkpointer will resume that node from its beginning and the write will
run again.

Two obligations follow, and both are tracked:

1. Every side-effecting write must be idempotent under replay. Neo4j `MERGE` and pgvector
   upsert-on-content-hash already satisfy this; the episodic write is a bare `INSERT` and
   does not. P2-A fixes it.
2. Irreversible external effects cannot be made safe by idempotency alone and need an
   approval gate rather than a retry. P4-C introduces the reversibility-tiered tool
   registry that enforces this.

**What this decision is not about, and the two clocks it conflates.** The argument above
measures one clock: how long an agent _run_ takes, which is seconds. A payer workflow runs
on a second clock entirely. A prior authorization is submitted, pends for records, waits on
a clinician, and may be appealed — days to weeks, mostly spent idle, with external
callbacks and durable timers. That is the shape a workflow engine exists for, and nothing
here argues against it.

These are different layers, and the checkpointer is the seam between them. LangGraph owns
reasoning _within_ a turn: retrieve, plan, act, distill, reflect, resumable on its
`thread_id`. A durable execution engine would own the _case_ that spans turns — the timers,
the human waits, the compensation when a step is retracted weeks later. A case orchestrator
invoking this graph as one durable step is a coherent architecture, and choosing LangGraph
here does not foreclose it.

What would be incoherent is running both at the same layer: a workflow engine driving
node-by-node execution while LangGraph also owns the graph. That is the conflict the DBOS
note above is really describing.

**Revisit if** a single run starts spanning minutes with external callbacks, or the system
grows fan-out across agents with independent failure domains. Adding a case layer above the
graph is not a revisit of this decision — it is a new one, and it belongs in its own record.
