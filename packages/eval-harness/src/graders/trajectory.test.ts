import { describe, it, expect } from 'vitest';
import {
  computeTrajectoryMetrics,
  toolSteps,
  trajectoryGraders,
  type TrajectoryStep,
} from './trajectory.js';
import type { ToolCall, Transcript } from '../types.js';

const steps = (...names: string[]): TrajectoryStep[] =>
  names.map((name) => ({ name, succeeded: true }));

describe('computeTrajectoryMetrics', () => {
  it('scores an identical sequence as an exact match', () => {
    const metrics = computeTrajectoryMetrics(steps('a', 'b', 'c'), ['a', 'b', 'c']);
    expect(metrics).toEqual({
      exactMatch: 1,
      inOrderMatch: 1,
      anyOrderMatch: 1,
      precision: 1,
      recall: 1,
    });
  });

  it('accepts a repeated step in order but not as an exact match', () => {
    // The shape of today's graph: `act` loops, so the reference names it once
    // and the run visits it n times.
    const metrics = computeTrajectoryMetrics(steps('plan', 'act', 'act', 'act', 'distill'), [
      'plan',
      'act',
      'distill',
    ]);
    expect(metrics.exactMatch).toBe(0);
    expect(metrics.inOrderMatch).toBe(1);
    expect(metrics.anyOrderMatch).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.precision).toBeCloseTo(3 / 5);
  });

  it('separates order from membership', () => {
    const metrics = computeTrajectoryMetrics(steps('b', 'a'), ['a', 'b']);
    expect(metrics.anyOrderMatch).toBe(1);
    expect(metrics.inOrderMatch).toBe(0);
    expect(metrics.exactMatch).toBe(0);
  });

  it('treats an empty reference as vacuously satisfied', () => {
    expect(computeTrajectoryMetrics([], []).recall).toBe(1);
    expect(computeTrajectoryMetrics([], []).precision).toBe(1);
  });

  it('counts an errored step as a step that happened and did not succeed', () => {
    // The whole point of the rule. The agent spent the call, so it is in the
    // denominator of precision; it achieved nothing, so it is not in recall.
    // An agent must not be able to improve its precision by failing.
    const actual: TrajectoryStep[] = [
      { name: 'web-search', succeeded: true },
      { name: 'web-search', succeeded: false },
    ];
    const metrics = computeTrajectoryMetrics(actual, ['web-search']);
    expect(metrics.precision).toBeCloseTo(1 / 2);
    expect(metrics.recall).toBe(1);
  });

  it('scores an all-errored run at zero precision', () => {
    const actual: TrajectoryStep[] = [{ name: 'web-search', succeeded: false }];
    const metrics = computeTrajectoryMetrics(actual, ['web-search']);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
  });
});

describe('toolSteps', () => {
  it('reads `act`’s error field as the failure signal', () => {
    const calls: ToolCall[] = [
      { name: 'web-search', input: {}, output: { results: [] } },
      { name: 'missing-tool', input: {}, output: null, error: 'Tool "missing-tool" not found' },
    ];
    expect(toolSteps(calls)).toEqual([
      { name: 'web-search', succeeded: true },
      { name: 'missing-tool', succeeded: false },
    ]);
  });
});

function transcript(nodes: string[], toolCalls: ToolCall[]): Transcript {
  return {
    runId: '550e8400-e29b-41d4-a716-446655440001',
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    messages: [],
    nodeSequence: nodes,
    toolCalls,
    retrievedContext: [],
    tokenCounts: { prompt: 1, completion: 1 },
    outcome: 'success',
    latencyMs: 1,
  };
}

describe('trajectoryGraders', () => {
  it('produces one grader per declared threshold and no others', async () => {
    const graders = trajectoryGraders({
      nodes: ['plan', 'act'],
      thresholds: { trajectory_recall: 1, trajectory_precision: 0 },
    });
    expect(graders.map((g) => g.name).sort()).toEqual([
      'trajectory_precision',
      'trajectory_recall',
    ]);
  });

  it('reports a metric without gating it when the threshold is zero', async () => {
    const [precision] = trajectoryGraders({
      nodes: ['plan'],
      thresholds: { trajectory_precision: 0 },
    });
    const score = await precision!.grade(transcript(['plan', 'act', 'act'], []), undefined);
    expect(score.value).toBeCloseTo(1 / 3);
    expect(score.label).toBe('pass');
  });

  it('fails a gated metric that falls below its threshold', async () => {
    const [recall] = trajectoryGraders({
      nodes: ['plan', 'reflect'],
      thresholds: { trajectory_recall: 1 },
    });
    const score = await recall!.grade(transcript(['plan'], []), undefined);
    expect(score.value).toBeCloseTo(0.5);
    expect(score.label).toBe('fail');
  });

  it('scores the tool sequence separately from the node sequence', async () => {
    const graders = trajectoryGraders({
      toolCalls: ['web-search'],
      thresholds: { tool_trajectory_recall: 1 },
    });
    const failed = await graders[0]!.grade(
      transcript(['act'], [{ name: 'web-search', input: {}, output: null, error: 'upstream 500' }]),
      undefined,
    );
    expect(failed.label).toBe('fail');
  });
});
