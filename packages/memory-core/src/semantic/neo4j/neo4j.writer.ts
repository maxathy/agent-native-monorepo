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

export interface Neo4jWriter {
  mergeEntity(entity: z.infer<typeof EntityWriteSchema>): Promise<void>;
  mergeRelationship(rel: z.infer<typeof RelationshipWriteSchema>): Promise<void>;
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
