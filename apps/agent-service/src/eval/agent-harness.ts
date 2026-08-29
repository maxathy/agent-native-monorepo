import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type pg from 'pg';
import type { Driver } from 'neo4j-driver';
import {
  PgNeo4jMemoryInspector,
  PgNeo4jSeedManager,
  type MemoryInspector,
  type SeedManager,
} from '@repo/memory-core';
import {
  detectAxes,
  fixtureEmbedding,
  type AgentHarness,
  type Axes,
  type MemoryOutcome,
  type Task,
  type Transcript,
} from '@repo/eval-harness';
import { AppModule } from '../app.module.js';
import { PG_POOL, NEO4J_DRIVER } from '../memory/memory.tokens.js';
import { RunsService } from '../runs/runs.service.js';

/**
 * The adapter between `packages/eval-harness` and this service.
 *
 * It boots the real application context rather than composing its own
 * dependency set, so a trial exercises the same `MemoryModule` providers, the
 * same model axis and the same checkpointer a request would. An evaluation
 * that wires up its own graph measures a system nobody deploys.
 *
 * It lives here rather than in the package for the obvious reason: a package
 * that imports an app is backwards. `AgentHarness` is the seam, and everything
 * on this side of it knows about Nest.
 */
export class AgentServiceHarness implements AgentHarness<MemoryOutcome> {
  readonly name = 'agent-service';

  /**
   * What `distill` produced on each run, kept until its outcome is captured.
   *
   * `Transcript` is the system-agnostic record and has no business carrying an
   * extraction, but `entity_merged` has to ask whether *this run's* concepts
   * reached the graph — and `mergeEntity` writes no episode onto a `:Concept`,
   * so there is nothing on the node to ask with.
   */
  private readonly extractionByRun = new Map<string, string[]>();

  constructor(
    private readonly context: INestApplicationContext,
    private readonly runs: RunsService,
    private readonly inspector: MemoryInspector,
    private readonly seeds: SeedManager,
  ) {}

  axes(): Axes {
    return detectAxes();
  }

  /**
   * Removes what the previous trial wrote, then lays the task's seed back down.
   *
   * Both halves are needed. Deleting alone leaves a two-task suite unrepeatable
   * — the Neo4j side of `restoreToSeed` is database-wide, because neither
   * `:Concept` nor `:Fact` carries a session, so task 2's reset takes task 1's
   * concepts with it. Applying alone leaves the previous trial's episodes and
   * facts in place, and `episodes` is keyed on `(session_id, turn_index)` with
   * first write wins, so trial 2 would write no row and its `run_id` would
   * appear nowhere.
   *
   * It also means `yarn eval` does not require `scripts/seed-eval-fixtures.mjs`
   * to have run first. That script stays because the nightly workflow seeds
   * before it runs anything, and P1-C owns that path.
   */
  async reset(task: Task<MemoryOutcome>): Promise<void> {
    const sessionId = (task.input as { sessionId: string }).sessionId;

    await this.seeds.restoreToSeed({
      sessionId,
      conceptIds: task.seeds.neo4j.map((concept) => concept.id),
      contentHashes: task.seeds.pgvector.map((fact) => fact.contentHash),
    });

    await this.seeds.applySeed({
      concepts: task.seeds.neo4j,
      relationships: task.seeds.relationships,
      facts: task.seeds.pgvector.map((fact) => ({ ...fact, embedding: fixtureEmbedding() })),
    });
  }

  async run(task: Task<MemoryOutcome>): Promise<Transcript> {
    const startedAt = Date.now();
    const traced = await this.runs.executeTraced({
      body: task.input,
      correlationId: `eval-${randomUUID()}`,
    });
    const latencyMs = Date.now() - startedAt;

    this.extractionByRun.set(
      traced.response.runId,
      (traced.extraction?.entities ?? []).map((entity) => entity.id),
    );

    return {
      runId: traced.response.runId,
      sessionId: traced.response.sessionId,
      messages: traced.response.messages,
      nodeSequence: traced.nodeSequence,
      toolCalls: traced.toolOutputs.map((output) => ({
        name: output.toolName,
        input: output.input,
        output: output.output,
        // Preserved rather than normalized away: an errored call is a call that
        // happened and did not succeed, and the trajectory metrics need both
        // halves of that.
        ...(output.error === undefined ? {} : { error: output.error }),
      })),
      retrievedContext: traced.response.retrievedContext.map((candidate) => ({
        source: candidate.source,
        content: candidate.content,
        score: candidate.score,
      })),
      tokenCounts: traced.response.tokenCounts,
      outcome: traced.response.outcome,
      latencyMs,
    };
  }

  async captureOutcome(_task: Task<MemoryOutcome>, transcript: Transcript): Promise<MemoryOutcome> {
    const extractedConceptIds = this.extractionByRun.get(transcript.runId) ?? [];
    this.extractionByRun.delete(transcript.runId);

    const inspection = await this.inspector.inspectRun({
      runId: transcript.runId,
      conceptIds: extractedConceptIds,
    });

    return {
      runId: transcript.runId,
      sessionId: transcript.sessionId,
      episodeRowsForRun: inspection.episodeRowsForRun,
      factRowsForRun: inspection.factRowsForRun,
      factNodesForRun: inspection.factNodesForRun,
      extractedConceptIds,
      mergedConceptIds: inspection.presentConceptIds,
    };
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

/**
 * Boots the service as an application context and wires the harness to it.
 *
 * `createApplicationContext` rather than `create`: the graph does not need an
 * HTTP listener to run, and binding a port would make two concurrent eval runs
 * collide. `abortOnError: false` for the reason `main.ts` gives — Nest aborts
 * the process with SIGABRT and no message when a provider factory throws, and a
 * misconfigured memory axis is a configuration mistake whose message is the
 * whole point.
 */
export async function createAgentServiceHarness(): Promise<AgentServiceHarness> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: false,
  });

  const pool = context.get<pg.Pool | null>(PG_POOL);
  const driver = context.get<Driver | null>(NEO4J_DRIVER);

  if (!pool || !driver) {
    await context.close();
    throw new Error(
      'the memory axis is unconfigured: set DATABASE_URL and NEO4J_URI. ' +
        'Outcome graders read persisted state, and against the no-op writers they ' +
        'cannot tell "wrote nothing" from "there was nowhere to write".',
    );
  }

  return new AgentServiceHarness(
    context,
    context.get(RunsService),
    new PgNeo4jMemoryInspector(pool, driver),
    new PgNeo4jSeedManager(pool, driver),
  );
}
