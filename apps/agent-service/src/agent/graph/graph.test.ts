import { describe, it, expect } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '@repo/memory-core';
import { buildAgentGraph, type GraphDeps } from './graph.js';

/**
 * The graph is assembled at request time, so a construction error surfaces as a
 * 500 rather than a startup failure. The specific error this guards against —
 * a state channel colliding with a node name — is thrown by `addNode` and is
 * invisible to a type check. Nothing but calling `buildAgentGraph` catches it.
 */
function makeDeps(): GraphDeps {
  const embedding = () => Promise.resolve(new Array(EMBEDDING_DIMENSIONS).fill(0));

  return {
    retrieve: {
      retrievalFacade: { retrieve: async () => [] },
      embedQuery: embedding,
    },
    plan: {
      callLlm: async () => ({ content: 'a plan', tokenCounts: { prompt: 0, completion: 0 } }),
    },
    act: { tools: [], selectTool: async () => null },
    reflect: {
      episodicRepo: {
        write: async () => ({ id: '550e8400-e29b-41d4-a716-446655440002' }),
        findBySession: async () => [],
      },
      neo4jWriter: { mergeEntity: async () => {}, mergeRelationship: async () => {} },
      pgvectorWriter: { upsertFact: async () => {}, ensureTable: async () => {} },
      extractEntities: async () => ({ entities: [], relationships: [], facts: [] }),
      embedText: embedding,
    },
  };
}

describe('buildAgentGraph', () => {
  it('compiles without throwing', () => {
    expect(() => buildAgentGraph(makeDeps(), {}, 'corr-123')).not.toThrow();
  });

  it('returns an invocable compiled graph', () => {
    const compiled = buildAgentGraph(makeDeps(), {}, 'corr-123');

    expect(typeof compiled.invoke).toBe('function');
    expect(typeof compiled.stream).toBe('function');
  });

  it('registers all six nodes without colliding with a state channel', () => {
    const compiled = buildAgentGraph(makeDeps(), {}, 'corr-123');
    const nodes = Object.keys(compiled.getGraph().nodes)
      .filter((name) => !name.startsWith('__'))
      .sort();

    expect(nodes).toEqual(['act', 'egress', 'ingress', 'plan', 'reflect', 'retrieve']);
  });
});
