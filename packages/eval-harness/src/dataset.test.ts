import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DATASETS_DIR, loadMemoryRecallSuite, loadSuite, taskFromSpec } from './dataset.js';

describe('the shipped dataset', () => {
  it('resolves its directory from the package rather than a path literal', () => {
    // The coupling that makes this worth asserting is one-way: a task file that
    // moves while a path literal stays behind makes the seed script find
    // nothing, seed nothing, and report success over an empty database.
    expect(existsSync(join(EVAL_DATASETS_DIR, 'memory-recall'))).toBe(true);
  });

  it('loads memory-recall-001, migrated from run-fixture-001.json', () => {
    const suite = loadMemoryRecallSuite();
    expect(suite.tasks).toHaveLength(1);

    const task = suite.tasks[0]!;
    expect(task.id).toBe('memory-recall-001');
    // expectedSeeds is retained exactly as the fixture carried it.
    expect(task.seeds.neo4j.map((c) => c.id)).toEqual(['concept-a', 'concept-b']);
    expect(task.seeds.pgvector).toHaveLength(1);
    expect(task.seeds.relationships).toHaveLength(1);
  });

  it('runs five trials per task by default', () => {
    expect(loadMemoryRecallSuite().trialsPerTask).toBe(5);
  });

  it('turns the three dormant assertions into named graders', () => {
    const names = loadMemoryRecallSuite().tasks[0]!.graders.map((g) => g.name);
    expect(names).toContain('retrieved_context_min_length');
    expect(names).toContain('outcome_must_be');
    expect(names).toContain('token_counts_positive');
  });

  it('grades persisted state, and says which axis that needs', () => {
    const graders = loadMemoryRecallSuite().tasks[0]!.graders;
    const episodic = graders.find((g) => g.name === 'episodic_row_written');
    const entity = graders.find((g) => g.name === 'entity_merged');

    expect(episodic?.requires).toEqual({ memory: 'live' });
    expect(entity?.requires).toEqual({ memory: 'live' });
  });

  it('declares itself a vector-path task and says why', () => {
    // Not decoration. The seed script writes :Concept and RELATES_TO and no
    // :Fact, and expandFromSeeds only returns facts — so a reader who assumed
    // "graph seeds" meant "graph coverage" would be wrong.
    const suite = loadSuite('memory-recall', join(EVAL_DATASETS_DIR, 'memory-recall'));
    expect(suite.tasks[0]!.description).toBeTruthy();
  });

  it('builds no grader for an assertion the task does not declare', () => {
    const task = taskFromSpec({
      id: 'minimal',
      description: 'only one assertion',
      retrievalPath: 'vector',
      input: {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        messages: [{ role: 'user', content: 'hello' }],
      },
      expectedSeeds: { neo4j: [], relationships: [], pgvector: [] },
      expectedOutcome: 'success',
      assertions: { outcomeMustBe: 'success' },
    });

    expect(task.graders.map((g) => g.name)).toEqual(['outcome_must_be']);
  });

  it('refuses a dataset directory with no task files in it', () => {
    expect(() => loadSuite('empty', EVAL_DATASETS_DIR)).toThrow(/loaded no tasks/);
  });
});
