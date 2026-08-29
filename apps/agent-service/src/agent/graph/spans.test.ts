import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { context, trace, type Span } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { EMBEDDING_DIMENSIONS } from '@repo/memory-core';
import { buildAgentGraph, type GraphDeps } from './graph.js';

const exporter = new InMemorySpanExporter();

/**
 * `docs/STATUS.md` row 13 recorded the memory child spans as real but
 * unreachable: they lived in classes constructed only inside
 * `packages/memory-core/test/`, so a live trace showed six node spans and no
 * children. These assertions are about the shape of the trace the wired
 * service produces — that the store spans hang off the node that opened them,
 * and that the request's topK and hopDepth reach them.
 */
describe('trace shape', () => {
  let spans: ReadableSpan[];

  beforeAll(async () => {
    // Without a context manager `startActiveSpan` does not propagate the
    // active span and every span comes out parentless, which would make these
    // assertions vacuous. `initTelemetry` gets one from sdk-node in the real
    // service; this suite registers it directly.
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);

    const tracer = trace.getTracer('memory-core');
    const withSpan = async <T>(name: string, attrs: Record<string, number>, value: T) =>
      tracer.startActiveSpan(name, async (span: Span) => {
        for (const [key, attr] of Object.entries(attrs)) span.setAttribute(key, attr);
        span.end();
        return value;
      });

    const deps: GraphDeps = {
      retrieve: {
        // Stands in for HybridRetrievalFacade, which opens exactly these two
        // spans from PgPgvectorReader and CypherNeo4jReader.
        retrievalFacade: {
          retrieve: async (query) => {
            await withSpan('memory.pgvector.search', { topK: query.topK ?? -1 }, null);
            await withSpan('memory.neo4j.expand', { hopDepth: query.hopDepth ?? -1 }, null);
            return [];
          },
        },
        embedQuery: async () => new Array(EMBEDDING_DIMENSIONS).fill(0),
      },
      plan: {
        callLlm: async () => ({ content: 'a plan', tokenCounts: { prompt: 0, completion: 0 } }),
      },
      act: { tools: [], selectTool: async () => null },
      distill: {
        extractEntities: async () => ({
          entities: [{ id: 'langgraph', label: 'LangGraph' }],
          relationships: [],
          facts: [{ text: 'A fact.' }],
        }),
      },
      reflect: {
        episodicRepo: {
          write: async () => ({ id: '550e8400-e29b-41d4-a716-446655440002' }),
          findBySession: async () => [],
        },
        neo4jWriter: {
          mergeEntity: async () => {
            await withSpan('memory.neo4j.mergeEntity', {}, undefined);
          },
          mergeRelationship: async () => {},
          mergeFact: async () => {},
        },
        pgvectorWriter: {
          upsertFact: async () => {
            await withSpan('memory.pgvector.upsert', {}, undefined);
          },
        },
        embedText: async () => new Array(EMBEDDING_DIMENSIONS).fill(0),
      },
    };

    const compiled = buildAgentGraph(
      deps,
      {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        messages: [{ role: 'user', content: 'What is LangGraph?' }],
        config: { topK: 3, hopDepth: 1 },
      },
      'corr-123',
    );
    await compiled.invoke({ runId: '550e8400-e29b-41d4-a716-446655440006' });

    spans = exporter.getFinishedSpans();
  });

  afterAll(async () => {
    await exporter.shutdown();
  });

  const find = (name: string) => spans.find((span) => span.name === name);
  const parentOf = (name: string) => {
    const child = find(name);
    return spans.find((span) => span.spanContext().spanId === child?.parentSpanContext?.spanId);
  };

  it('nests the retrieval store spans under agent.node.retrieve', () => {
    expect(parentOf('memory.pgvector.search')?.name).toBe('agent.node.retrieve');
    expect(parentOf('memory.neo4j.expand')?.name).toBe('agent.node.retrieve');
  });

  it('nests the write spans under agent.node.reflect', () => {
    expect(parentOf('memory.neo4j.mergeEntity')?.name).toBe('agent.node.reflect');
    expect(parentOf('memory.pgvector.upsert')?.name).toBe('agent.node.reflect');
  });

  it('carries the request’s topK and hopDepth into the store spans', () => {
    // RunRequestConfig validated these and retrieve then hardcoded 10 and 2.
    expect(find('memory.pgvector.search')?.attributes['topK']).toBe(3);
    expect(find('memory.neo4j.expand')?.attributes['hopDepth']).toBe(1);
  });
});
