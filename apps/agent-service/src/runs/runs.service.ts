import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { RunResponse, StreamEvent } from '@repo/agent-contracts';
import { createLogger } from '@repo/telemetry';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
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
    if (this.graphDeps) return this.graphDeps;
    if (process.env['GOOGLE_API_KEY']) return this.createGeminiDeps();
    return this.createStubDeps();
  }

  private createGeminiDeps(): GraphDeps {
    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: process.env['GOOGLE_API_KEY'],
    });

    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: 'text-embedding-004',
      apiKey: process.env['GOOGLE_API_KEY'],
    });

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

    const embed = (text: string) => embeddings.embedQuery(text);

    return {
      retrieve: {
        retrievalFacade: {
          retrieve: async () => [],
        },
        embedQuery: embed,
      },
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
            const parsed = JSON.parse(response.content);
            return parsed;
          } catch {
            return null;
          }
        },
      },
      reflect: {
        episodicRepo: {
          write: async () => ({ id: crypto.randomUUID() }),
          findBySession: async () => [],
        },
        neo4jWriter: {
          mergeEntity: async () => { },
          mergeRelationship: async () => { },
        },
        pgvectorWriter: {
          upsertFact: async () => { },
          ensureTable: async () => { },
        },
        extractEntities: async (context: string) => {
          const response = await callLlm(
            `Extract entities, relationships, and facts from the conversation. Respond with JSON:
{"entities": [{"id": "...", "label": "...", "description": "..."}], "relationships": [{"fromId": "...", "toId": "...", "type": "...", "confidence": 0.9}], "facts": [{"text": "..."}]}`,
            context,
          );
          try {
            return JSON.parse(response.content);
          } catch {
            return { entities: [], relationships: [], facts: [] };
          }
        },
        embedText: embed,
      },
    };
  }

  private createStubDeps(): GraphDeps {
    const stubEmbedding = () =>
      Promise.resolve(new Array(768).fill(0).map((_, i) => Math.sin(i * 0.01)));

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
          mergeEntity: async () => { },
          mergeRelationship: async () => { },
        },
        pgvectorWriter: {
          upsertFact: async () => { },
          ensureTable: async () => { },
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
