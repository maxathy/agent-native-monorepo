import { createHash } from 'node:crypto';
import { getTracer } from '@repo/telemetry';
import type { EpisodicRepository, Neo4jWriter, PgvectorWriter } from '@repo/memory-core';
import type { AgentState } from '../graph/state.js';

const tracer = getTracer('agent-service');

export interface ReflectNodeDeps {
  episodicRepo: EpisodicRepository;
  neo4jWriter: Neo4jWriter;
  pgvectorWriter: PgvectorWriter;
  extractEntities: (context: string) => Promise<{
    entities: Array<{ id: string; label: string; description?: string }>;
    relationships: Array<{
      fromId: string;
      toId: string;
      type: string;
      confidence: number;
    }>;
    facts: Array<{ text: string }>;
  }>;
  embedText: (text: string) => Promise<number[]>;
}

/**
 * The reflect node is the sole writer to Episodic and Semantic memory.
 * All four operations are idempotent and crash-safe:
 * 1. Write messages to Episodic
 * 2. Extract entities/relationships via LLM
 * 3. MERGE entities and relationships into Neo4j
 * 4. Upsert distilled facts into pgvector
 */
export async function reflectNode(
  state: AgentState,
  deps: ReflectNodeDeps,
): Promise<Partial<AgentState>> {
  return tracer.startActiveSpan('agent.node.reflect', async (span) => {
    try {
      span.setAttribute('run_id', state.runId);
      span.setAttribute('session_id', state.sessionId);
      span.setAttribute('message_count', state.messages.length);

      // Step 1: Write messages to Episodic memory
      for (let i = 0; i < state.messages.length; i++) {
        const message = state.messages[i]!;
        await deps.episodicRepo.write({
          sessionId: state.sessionId,
          runId: state.runId,
          turnIndex: i,
          role: message.role,
          content: message.content,
          metadata: { tokenCounts: state.tokenCounts },
        });
      }

      // Step 2: Extract entities and relationships from session context
      const sessionContext = state.messages.map((m) => `${m.role}: ${m.content}`).join('\n');

      const extraction = await deps.extractEntities(sessionContext);
      span.setAttribute('entity_count', extraction.entities.length);
      span.setAttribute('relationship_count', extraction.relationships.length);
      span.setAttribute('fact_count', extraction.facts.length);

      // Step 3: MERGE entities and relationships into Neo4j (idempotent)
      for (const entity of extraction.entities) {
        await deps.neo4jWriter.mergeEntity(entity);
      }

      for (const rel of extraction.relationships) {
        await deps.neo4jWriter.mergeRelationship({
          ...rel,
          episodeId: state.runId,
          createdAt: new Date(),
        });
      }

      // Step 4: Upsert distilled facts into pgvector (idempotent)
      for (const fact of extraction.facts) {
        const contentHash = createHash('sha256').update(fact.text).digest('hex');
        const embedding = await deps.embedText(fact.text);

        await deps.pgvectorWriter.upsertFact({
          contentHash,
          text: fact.text,
          embedding,
          episodeId: state.runId,
          sessionId: state.sessionId,
        });
      }

      // reflect is a side-effect node — does not modify agent state
      return {};
    } finally {
      span.end();
    }
  });
}
