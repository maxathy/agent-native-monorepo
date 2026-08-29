import { z } from 'zod';
import type { Driver } from 'neo4j-driver';
import { getTracer } from '@repo/telemetry';

const tracer = getTracer('memory-core');

export const EntityWriteSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});

export const RelationshipWriteSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: z.string(),
  confidence: z.number().min(0).max(1),
  episodeId: z.string().uuid(),
  createdAt: z.date().default(() => new Date()),
});

export const FactWriteSchema = z.object({
  contentHash: z.string(),
  text: z.string(),
  episodeId: z.string().uuid(),
  entityIds: z.array(z.string()).default([]),
});

export interface Neo4jWriter {
  mergeEntity(entity: z.infer<typeof EntityWriteSchema>): Promise<void>;
  mergeRelationship(rel: z.infer<typeof RelationshipWriteSchema>): Promise<void>;
  mergeFact(fact: z.infer<typeof FactWriteSchema>): Promise<void>;
}

export class CypherNeo4jWriter implements Neo4jWriter {
  constructor(private readonly driver: Driver) {}

  async mergeEntity(entity: z.infer<typeof EntityWriteSchema>): Promise<void> {
    const validated = EntityWriteSchema.parse(entity);

    return tracer.startActiveSpan('memory.neo4j.mergeEntity', async (span) => {
      try {
        span.setAttribute('entity.id', validated.id);
        const session = this.driver.session();
        try {
          await session.run(
            `MERGE (c:Concept {id: $id})
             ON CREATE SET c.label = $label, c.description = $description
             ON MATCH SET c.label = $label, c.description = $description`,
            {
              id: validated.id,
              label: validated.label,
              description: validated.description ?? null,
            },
          );
        } finally {
          await session.close();
        }
      } finally {
        span.end();
      }
    });
  }

  /**
   * Writes a fact into the graph and links it to the concepts it mentions.
   *
   * This is what makes fusion possible. Before it existed the graph held only
   * `:Concept` nodes while pgvector held facts, so the two retrievers returned
   * different kinds of object and RRF had two disjoint universes to merge —
   * no candidate could appear in both lists, so no score was ever summed and
   * the result was interleaving rather than fusion. Keyed on the same
   * `contentHash` pgvector uses, a fact found by both paths is now one
   * candidate. ADR 0004 records the decision.
   */
  async mergeFact(fact: z.infer<typeof FactWriteSchema>): Promise<void> {
    const validated = FactWriteSchema.parse(fact);

    return tracer.startActiveSpan('memory.neo4j.mergeFact', async (span) => {
      try {
        span.setAttribute('fact.contentHash', validated.contentHash);
        span.setAttribute('fact.entityCount', validated.entityIds.length);

        const session = this.driver.session();
        try {
          // The fact node is merged before the UNWIND, so an extraction that
          // produced facts but no entities still lands the fact — an empty
          // list ends the pipeline after the MERGE, it does not undo it.
          await session.run(
            `MERGE (f:Fact {contentHash: $contentHash})
             ON CREATE SET f.text = $text, f.episodeId = $episodeId
             ON MATCH SET f.text = $text
             WITH f
             UNWIND $entityIds AS eid
             MATCH (c:Concept {id: eid})
             MERGE (f)-[:MENTIONS]->(c)`,
            {
              contentHash: validated.contentHash,
              text: validated.text,
              episodeId: validated.episodeId,
              entityIds: validated.entityIds,
            },
          );
        } finally {
          await session.close();
        }
      } finally {
        span.end();
      }
    });
  }

  async mergeRelationship(rel: z.infer<typeof RelationshipWriteSchema>): Promise<void> {
    const validated = RelationshipWriteSchema.parse(rel);

    return tracer.startActiveSpan('memory.neo4j.mergeRelationship', async (span) => {
      try {
        span.setAttribute('relationship.type', validated.type);
        span.setAttribute('relationship.fromId', validated.fromId);
        span.setAttribute('relationship.toId', validated.toId);

        const session = this.driver.session();
        try {
          await session.run(
            `MERGE (a:Concept {id: $fromId})
             MERGE (b:Concept {id: $toId})
             MERGE (a)-[r:RELATES_TO {type: $type}]->(b)
             ON CREATE SET r.confidence = $confidence,
                           r.episodeId = $episodeId,
                           r.createdAt = datetime($createdAt)
             ON MATCH SET r.confidence = $confidence,
                          r.episodeId = $episodeId`,
            {
              fromId: validated.fromId,
              toId: validated.toId,
              type: validated.type,
              confidence: validated.confidence,
              episodeId: validated.episodeId,
              createdAt: validated.createdAt.toISOString(),
            },
          );
        } finally {
          await session.close();
        }
      } finally {
        span.end();
      }
    });
  }
}
