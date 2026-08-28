# Architecture Decision Records

One file per decision, numbered sequentially, in the format popularized by Michael Nygard:
context, decision, consequences. A record is never edited after it reaches `accepted` —
if the decision changes, write a new record and mark the old one `superseded by NNNN`.

The bar for writing one: a reviewer would reasonably ask "why did you do it that way,"
and the answer is not obvious from the code.

| ID | Title | Status |
| --- | --- | --- |
| [0001](0001-langgraph-over-a-durable-execution-engine.md) | LangGraph over a durable execution engine | accepted |
| [0002](0002-neo4j-and-pgvector-rather-than-one-store.md) | Neo4j and pgvector rather than one store | accepted |
