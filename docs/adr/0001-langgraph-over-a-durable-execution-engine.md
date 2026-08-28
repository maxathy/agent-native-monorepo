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

**Revisit if** runs start spanning minutes with external callbacks, or the system grows
fan-out across multiple agents with independent failure domains. At that point the
workflow engine earns its operational cost.
