import { describe, it, expect } from 'vitest';
import { EvalHarness } from './harness.js';
import { AxisRequirementError } from './axes.js';
import { ModelGrader } from './graders/model.js';
import type { AgentHarness, Axes, Grader, Task, Transcript } from './types.js';

interface FakeOutcome {
  readonly wrote: boolean;
}

function transcript(index: number): Transcript {
  return {
    runId: `run-${index}`,
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    messages: [],
    nodeSequence: ['ingress', 'egress'],
    toolCalls: [],
    retrievedContext: [],
    tokenCounts: { prompt: 1, completion: 1 },
    outcome: 'success',
    latencyMs: 1,
  };
}

/** Records the call order, which is the thing the runner is responsible for. */
function fakeAgent(axes: Axes, outcomes: FakeOutcome[], log: string[]): AgentHarness<FakeOutcome> {
  let index = 0;
  return {
    name: 'fake',
    axes: () => axes,
    reset: async () => {
      log.push('reset');
    },
    run: async () => {
      log.push('run');
      return transcript(index);
    },
    captureOutcome: async () => {
      log.push('capture');
      return outcomes[index++] ?? { wrote: false };
    },
    close: async () => {
      log.push('close');
    },
  };
}

const wroteSomething: Grader<FakeOutcome> = {
  name: 'wrote_something',
  kind: 'code',
  requires: { memory: 'live' },
  grade: async (_t, outcome) => ({
    value: outcome.wrote ? 1 : 0,
    label: outcome.wrote ? 'pass' : 'fail',
  }),
};

function task(graders: Grader<FakeOutcome>[]): Task<FakeOutcome> {
  return {
    id: 'memory-recall-001',
    description: 'a task',
    input: {},
    seeds: { neo4j: [], relationships: [], pgvector: [] },
    graders,
  };
}

const liveAxes: Axes = { model: 'live', memory: 'live' };

describe('EvalHarness', () => {
  it('resets before every trial, then runs, captures and grades', async () => {
    const log: string[] = [];
    const report = await new EvalHarness<FakeOutcome>({
      agent: fakeAgent(liveAxes, [{ wrote: true }, { wrote: true }], log),
      suite: { name: 's', tasks: [task([wroteSomething])], trialsPerTask: 2 },
    }).run();

    // Reset first, not last: a suite that crashes leaves the evidence of the
    // failed trial in the stores.
    expect(log).toEqual(['reset', 'run', 'capture', 'reset', 'run', 'capture']);
    expect(report.tasks[0]!.trials).toHaveLength(2);
  });

  it('reports pass@k as capability and pass^k as reliability', async () => {
    const report = await new EvalHarness<FakeOutcome>({
      agent: fakeAgent(liveAxes, [{ wrote: true }, { wrote: false }, { wrote: true }], []),
      suite: { name: 's', tasks: [task([wroteSomething])], trialsPerTask: 3 },
    }).run();

    const taskReport = report.tasks[0]!;
    expect(taskReport.passAtK).toBe(true);
    expect(taskReport.passHatK).toBe(false);
    expect(taskReport.perGraderPassRate['wrote_something']).toBeCloseTo(2 / 3);
    expect(report.passRate).toBeCloseTo(2 / 3);
  });

  it('reports pass^k true only when every trial passed', async () => {
    const report = await new EvalHarness<FakeOutcome>({
      agent: fakeAgent(liveAxes, [{ wrote: true }, { wrote: true }], []),
      suite: { name: 's', tasks: [task([wroteSomething])], trialsPerTask: 2 },
    }).run();

    expect(report.tasks[0]!.passHatK).toBe(true);
    expect(report.passRate).toBe(1);
  });

  it('refuses before running a single trial when an axis is unconfigured', async () => {
    const log: string[] = [];
    const harness = new EvalHarness<FakeOutcome>({
      agent: fakeAgent({ model: 'stub', memory: 'unconfigured' }, [{ wrote: false }], log),
      suite: { name: 's', tasks: [task([wroteSomething])], trialsPerTask: 5 },
    });

    await expect(harness.run()).rejects.toThrow(AxisRequirementError);
    // Not one model call, not one database write, and — the point — not one
    // reported pass earned against the no-op writers.
    expect(log).toEqual([]);
  });

  it('names an uncalibrated judge in the report', async () => {
    const judged = new ModelGrader<FakeOutcome>({
      name: 'answer_is_grounded',
      rubric: 'grounded?',
      systemUnderTestProvider: 'google',
      judge: {
        provider: 'anthropic',
        model: 'j',
        complete: async () => '{"label":"pass","explanation":"ok"}',
      },
    });

    const report = await new EvalHarness<FakeOutcome>({
      agent: fakeAgent(liveAxes, [{ wrote: true }], []),
      suite: { name: 's', tasks: [task([judged])], trialsPerTask: 1 },
    }).run();

    expect(report.uncalibratedGraders).toEqual(['answer_is_grounded']);
  });

  it('rejects a model grader that returns a score with no explanation', async () => {
    const silent: Grader<FakeOutcome> = {
      name: 'silent_judge',
      kind: 'model',
      grade: async () => ({ value: 1, label: 'pass' }),
    };

    const harness = new EvalHarness<FakeOutcome>({
      agent: fakeAgent(liveAxes, [{ wrote: true }], []),
      suite: { name: 's', tasks: [task([silent])], trialsPerTask: 1 },
    });

    await expect(harness.run()).rejects.toThrow(/no explanation/);
  });
});
