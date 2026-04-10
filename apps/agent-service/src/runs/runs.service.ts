import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { RunResponse, StreamEvent } from '@repo/agent-contracts';
import { createLogger } from '@repo/telemetry';
import {
  type EpisodicRepository,
  DrizzleEpisodicRepository,
  type Neo4jWriter,
  CypherNeo4jWriter,
  type PgvectorWriter,
  PgPgvectorWriter,
  type PgvectorReader,
  PgPgvectorReader,
  type Neo4jReader,
  CypherNeo4jReader,
  HybridRetrievalFacade,
} from '@repo/memory-core';
import { buildAgentGraph, type GraphDeps } from '../agent/graph/graph.js';
import { buildRunResponse } from '../agent/nodes/egress.node.js';
import type { AgentState } from '../agent/graph/state.js';

const logger = createLogger('runs-service');

@Injectable()
export class RunsService {
  private graphDeps: GraphDeps | undefined;

  setDeps(deps: GraphDeps): void {
    this.graphDeps = deps;
  }

  private getDeps(): GraphDeps {
    if (!this.graphDeps) {
      // Provide stub deps for demo/local mode when external services aren't configured
      return this.createStubDeps();
    }
    return this.graphDeps;
  }

  private createStubDeps(): GraphDeps {
    const stubEmbedding = () =>
      Promise.resolve(new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.01)));

    return {
      retrieve: {
        retrievalFacade: {
          retrieve: async () => [
            {
              source: 'pgvector',
              score: 0.85,
              content: 'LangGraph enables stateful agent workflows.',
            },
            {
              source: 'neo4j',
              score: 0.78,
              content: 'Agents use a Three-Brain memory architecture.',
              entityId: 'memory',
            },
          ],
        },
        embedQuery: stubEmbedding,
      },
      plan: {
        callLlm: async (_system: string, _user: string) => ({
          content:
            'I will research this topic and provide a comprehensive answer based on the available context.',
          tokenCounts: { prompt: 150, completion: 45 },
        }),
      },
      act: {
        tools: [
          {
            name: 'web-search',
            execute: async (input) => ({ results: [`Result for: ${JSON.stringify(input)}`] }),
          },
        ],
        selectTool: async () => null, // Stub: no tool needed
      },
      reflect: {
        episodicRepo: {
          write: async () => ({ id: crypto.randomUUID() }),
          findBySession: async () => [],
        },
        neo4jWriter: {
          mergeEntity: async () => {},
          mergeRelationship: async () => {},
        },
        pgvectorWriter: {
          upsertFact: async () => {},
          ensureTable: async () => {},
        },
        extractEntities: async () => ({
          entities: [
            { id: 'langgraph', label: 'LangGraph', description: 'Framework for stateful agents' },
          ],
          relationships: [],
          facts: [{ text: 'LangGraph is used for building stateful agent workflows.' }],
        }),
        embedText: stubEmbedding,
      },
    };
  }

  async execute(params: { body: unknown; correlationId: string }): Promise<RunResponse> {
    const deps = this.getDeps();
    const compiled = buildAgentGraph(deps, params.body, params.correlationId);

    logger.info({ msg: 'run.start', correlationId: params.correlationId });

    const result = await compiled.invoke({});
    const state = result as unknown as AgentState;

    return buildRunResponse(state);
  }

  async stream(params: { body: unknown; correlationId: string; res: Response }): Promise<void> {
    const deps = this.getDeps();
    const compiled = buildAgentGraph(deps, params.body, params.correlationId);

    logger.info({ msg: 'run.stream.start', correlationId: params.correlationId });

    const sendEvent = (event: StreamEvent) => {
      params.res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Stream node completions
    const stream = await compiled.stream({});

    for await (const chunk of stream) {
      const [nodeName] = Object.keys(chunk);
      if (nodeName) {
        sendEvent({ node: nodeName });
      }
    }

    // Signal completion
    sendEvent({ node: 'done' });
    params.res.end();
  }
}
