import { randomUUID } from 'node:crypto';
import { Injectable, Inject } from '@nestjs/common';
import type { Response } from 'express';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { RunResponse, StreamEvent } from '@repo/agent-contracts';
import { createLogger } from '@repo/telemetry';
import {
  EMBEDDING_DIMENSIONS,
  type EpisodicRepository,
  type Neo4jWriter,
  type PgvectorWriter,
  type RetrievalFacade,
} from '@repo/memory-core';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { buildAgentGraph, type GraphDeps } from '../agent/graph/graph.js';
import { buildRunResponse } from '../agent/nodes/egress.node.js';
import type { AgentState, Extraction } from '../agent/graph/state.js';
import { createGeminiEmbedder } from '../agent/model/gemini-embedder.js';
import {
  EPISODIC_REPOSITORY,
  NEO4J_WRITER,
  PGVECTOR_WRITER,
  RETRIEVAL_FACADE,
  CHECKPOINTER,
} from '../memory/memory.tokens.js';
import type { ActNodeDeps } from '../agent/nodes/act.node.js';
import type { DistillNodeDeps } from '../agent/nodes/distill.node.js';
import type { PlanNodeDeps } from '../agent/nodes/plan.node.js';

const logger = createLogger('runs-service');

const EXTRACTION_PROMPT = `Extract entities, relationships, and facts from the conversation. Respond with JSON:
{"entities": [{"id": "...", "label": "...", "description": "..."}], "relationships": [{"fromId": "...", "toId": "...", "type": "...", "confidence": 0.9}], "facts": [{"text": "..."}]}`;

const EMPTY_EXTRACTION: Extraction = { entities: [], relationships: [], facts: [] };

/** The model half of a dependency set: everything that costs a model call. */
interface ModelDeps {
  plan: PlanNodeDeps;
  act: ActNodeDeps;
  distill: DistillNodeDeps;
  embed: (text: string) => Promise<number[]>;
}

@Injectable()
export class RunsService {
  private graphDeps: GraphDeps | undefined;

  // Tokens are explicit: these are interfaces with no runtime value to infer,
  // and the dev path runs through tsx, where esbuild emits no decorator
  // metadata and an implicit parameter arrives as `undefined`.
  constructor(
    @Inject(EPISODIC_REPOSITORY) private readonly episodicRepo: EpisodicRepository | null,
    @Inject(NEO4J_WRITER) private readonly neo4jWriter: Neo4jWriter | null,
    @Inject(PGVECTOR_WRITER) private readonly pgvectorWriter: PgvectorWriter | null,
    @Inject(RETRIEVAL_FACADE) private readonly retrievalFacade: RetrievalFacade | null,
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver | null,
  ) {}

  setDeps(deps: GraphDeps): void {
    this.graphDeps = deps;
  }

  /**
   * Model availability and database availability are independent axes.
   *
   * This used to switch the whole dependency set on `GOOGLE_API_KEY`, so a
   * developer with Postgres but no API key got stub memory. `GOOGLE_API_KEY`
   * now selects the model half; `DATABASE_URL` + `NEO4J_URI`, resolved in
   * `MemoryModule`, select the memory half.
   */
  private getDeps(): GraphDeps {
    if (this.graphDeps) return this.graphDeps;

    const model = process.env['GOOGLE_API_KEY']
      ? this.createGeminiModelDeps(process.env['GOOGLE_API_KEY'])
      : this.createStubModelDeps();

    return {
      ...model,
      retrieve: {
        retrievalFacade: this.retrievalFacade ?? stubRetrievalFacade,
        embedQuery: model.embed,
      },
      reflect: {
        episodicRepo: this.episodicRepo ?? stubEpisodicRepository,
        neo4jWriter: this.neo4jWriter ?? stubNeo4jWriter,
        pgvectorWriter: this.pgvectorWriter ?? stubPgvectorWriter,
        embedText: model.embed,
      },
    };
  }

  private createGeminiModelDeps(apiKey: string): ModelDeps {
    const llm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', apiKey });

    const callLlm = async (systemPrompt: string, userPrompt: string) => {
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);
      const meta = response.usage_metadata;
      return {
        content: typeof response.content === 'string' ? response.content : '',
        tokenCounts: {
          prompt: meta?.input_tokens ?? 0,
          completion: meta?.output_tokens ?? 0,
        },
      };
    };

    return {
      plan: { callLlm },
      act: {
        tools: [
          {
            name: 'web-search',
            execute: async (input) => ({ results: [`Result for: ${JSON.stringify(input)}`] }),
          },
        ],
        selectTool: async (plan, tools) => {
          const toolNames = tools.map((t) => t.name).join(', ');
          const response = await callLlm(
            'You select the best tool for a task. Respond with JSON: {"toolName": "...", "input": ...} or null if no tool is needed.',
            `Plan: ${plan}\nAvailable tools: ${toolNames}`,
          );
          try {
            return JSON.parse(response.content);
          } catch {
            return null;
          }
        },
      },
      distill: {
        extractEntities: async (context: string) => {
          const response = await callLlm(EXTRACTION_PROMPT, context);
          try {
            return JSON.parse(response.content) as Extraction;
          } catch {
            return EMPTY_EXTRACTION;
          }
        },
      },
      embed: createGeminiEmbedder(apiKey),
    };
  }

  private createStubModelDeps(): ModelDeps {
    const stubEmbedding = () =>
      Promise.resolve(new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => Math.sin(i * 0.01)));

    return {
      plan: {
        callLlm: async () => ({
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
      distill: {
        extractEntities: async () => ({
          entities: [
            { id: 'langgraph', label: 'LangGraph', description: 'Framework for stateful agents' },
          ],
          relationships: [],
          facts: [{ text: 'LangGraph is used for building stateful agent workflows.' }],
        }),
      },
      embed: stubEmbedding,
    };
  }

  async execute(params: { body: unknown; correlationId: string }): Promise<RunResponse> {
    // The runId is minted here rather than in `ingress` because it is the
    // checkpointer's thread_id, and that has to exist before the invoke.
    const runId = randomUUID();
    const compiled = buildAgentGraph(
      this.getDeps(),
      params.body,
      params.correlationId,
      this.checkpointer ?? undefined,
    );

    logger.info({ msg: 'run.start', correlationId: params.correlationId, runId });

    const result = await compiled.invoke({ runId }, { configurable: { thread_id: runId } });

    return buildRunResponse(result as unknown as AgentState);
  }

  async stream(params: { body: unknown; correlationId: string; res: Response }): Promise<void> {
    const runId = randomUUID();
    const compiled = buildAgentGraph(
      this.getDeps(),
      params.body,
      params.correlationId,
      this.checkpointer ?? undefined,
    );

    logger.info({ msg: 'run.stream.start', correlationId: params.correlationId, runId });

    const sendEvent = (event: StreamEvent) => {
      params.res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const stream = await compiled.stream({ runId }, { configurable: { thread_id: runId } });

      for await (const chunk of stream) {
        const [nodeName] = Object.keys(chunk);
        if (nodeName) {
          sendEvent({ node: nodeName });
        }
      }

      sendEvent({ node: 'done' });
    } catch (error) {
      // The response is already committed — headers went out with the first
      // frame — so GlobalHttpExceptionFilter writing a JSON body onto it
      // throws ERR_HTTP_HEADERS_SENT and the client is left with a stream that
      // simply stops. Containment for a stream is a terminal frame, and the
      // error must not escape this method.
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ msg: 'run.stream.failed', correlationId: params.correlationId, runId, error: message });
      sendEvent({ node: 'error', error: { node: 'unknown', message } });
    } finally {
      params.res.end();
    }
  }
}

/**
 * The no-database path. It is load-bearing, not a convenience: P0-A requires
 * both README quickstart curls to succeed against a clone with no `.env`.
 *
 * These are reached only when the memory axis is *unconfigured*. A configured
 * store that is unreachable fails at boot in `MemoryModule` and never gets
 * here — falling back to no-op writers because a database is missing is the
 * defect this change removes.
 */
const stubRetrievalFacade: RetrievalFacade = {
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
};

const stubEpisodicRepository: EpisodicRepository = {
  write: async () => ({ id: randomUUID() }),
  findBySession: async () => [],
};

const stubNeo4jWriter: Neo4jWriter = {
  mergeEntity: async () => {},
  mergeRelationship: async () => {},
  mergeFact: async () => {},
};

const stubPgvectorWriter: PgvectorWriter = {
  upsertFact: async () => {},
};
