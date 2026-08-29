import type { Grader, Score, ToolCall, Transcript } from '../types.js';

/**
 * One step of a trajectory.
 *
 * `succeeded` is the whole reason this is not a bare `string[]`. `act` records
 * a failed tool call as an entry carrying an `error` rather than throwing, so a
 * failed call is a step that *happened*: it belongs in the denominator of
 * precision, because the agent spent it, and never in the numerator, because it
 * did not achieve what the reference asked for. Dropping errored calls instead
 * would let an agent improve its precision by failing.
 */
export interface TrajectoryStep {
  readonly name: string;
  readonly succeeded: boolean;
}

export interface TrajectoryMetrics {
  /** The successful steps are exactly the reference, in order and in count. */
  readonly exactMatch: number;
  /** The reference appears as a subsequence of the successful steps. */
  readonly inOrderMatch: number;
  /** Every reference step appears among the successful steps, order ignored. */
  readonly anyOrderMatch: number;
  /** Successful steps matching the reference / steps taken, errored included. */
  readonly precision: number;
  /** Reference steps achieved / reference steps. */
  readonly recall: number;
}

export const TRAJECTORY_METRICS = [
  'exactMatch',
  'inOrderMatch',
  'anyOrderMatch',
  'precision',
  'recall',
] as const;
export type TrajectoryMetricName = (typeof TRAJECTORY_METRICS)[number];

function multisetOverlap(actual: readonly string[], reference: readonly string[]): number {
  const remaining = new Map<string, number>();
  for (const name of reference) remaining.set(name, (remaining.get(name) ?? 0) + 1);

  let overlap = 0;
  for (const name of actual) {
    const left = remaining.get(name) ?? 0;
    if (left > 0) {
      remaining.set(name, left - 1);
      overlap += 1;
    }
  }
  return overlap;
}

function isSubsequence(reference: readonly string[], actual: readonly string[]): boolean {
  let cursor = 0;
  for (const name of actual) {
    if (cursor < reference.length && reference[cursor] === name) cursor += 1;
  }
  return cursor === reference.length;
}

/**
 * An empty side is vacuously satisfied rather than an error: a task with no
 * reference tool calls cannot have imprecise ones, and an agent that made no
 * calls made no wrong ones. The distinction that matters is carried by recall.
 */
export function computeTrajectoryMetrics(
  actual: readonly TrajectoryStep[],
  reference: readonly string[],
): TrajectoryMetrics {
  const succeeded = actual.filter((step) => step.succeeded).map((step) => step.name);
  const overlap = multisetOverlap(succeeded, reference);

  const exact =
    succeeded.length === reference.length && succeeded.every((name, i) => reference[i] === name);

  return {
    exactMatch: exact ? 1 : 0,
    inOrderMatch: isSubsequence(reference, succeeded) ? 1 : 0,
    anyOrderMatch: overlap === reference.length ? 1 : 0,
    precision: actual.length === 0 ? 1 : overlap / actual.length,
    recall: reference.length === 0 ? 1 : overlap / reference.length,
  };
}

export function nodeSteps(transcript: Transcript): TrajectoryStep[] {
  return transcript.nodeSequence.map((name) => ({ name, succeeded: true }));
}

export function toolSteps(toolCalls: readonly ToolCall[]): TrajectoryStep[] {
  return toolCalls.map((call) => ({ name: call.name, succeeded: call.error === undefined }));
}

export interface TrajectoryReference {
  readonly nodes?: readonly string[];
  readonly toolCalls?: readonly string[];
  /**
   * Per-metric pass thresholds, keyed by grader name. A metric with no entry is
   * not graded at all; a threshold of `0` means the metric is reported but not
   * gated, which is the honest way to publish a number whose value is expected
   * to vary — node precision falls with every extra `act` iteration, and
   * whether the model reaches for a tool is a property of the model.
   */
  readonly thresholds?: Readonly<Record<string, number>>;
}

const METRIC_SUFFIX: Record<TrajectoryMetricName, string> = {
  exactMatch: 'exact_match',
  inOrderMatch: 'in_order_match',
  anyOrderMatch: 'any_order_match',
  precision: 'precision',
  recall: 'recall',
};

function metricGrader<TOutcome>(
  name: string,
  threshold: number,
  compute: (transcript: Transcript) => TrajectoryMetrics,
  metric: TrajectoryMetricName,
): Grader<TOutcome> {
  return {
    name,
    kind: 'code',
    grade: async (transcript): Promise<Score> => {
      const value = compute(transcript)[metric];
      return {
        value,
        label: value >= threshold ? 'pass' : 'fail',
        explanation: `${value.toFixed(3)} against a threshold of ${threshold.toFixed(3)}`,
      };
    },
  };
}

/**
 * Trajectory scoring over the node sequence and the tool-call sequence.
 *
 * These are separate failure modes and need separate numbers: an agent can make
 * every tool call correctly and still fail the task, and it can reach the right
 * answer through a wasteful path.
 *
 * What the node half can show today is limited by the graph. `graph.ts` wires
 * one conditional edge — `act -> act | distill` — and every other edge is
 * unconditional, so the sequence is
 * `ingress -> retrieve -> plan -> act{1..maxSteps} -> distill -> reflect -> egress`
 * and varies only in the loop count. These metrics are built for the graph this
 * will become and demonstrated on the axis that moves today, which is the
 * tool-call sequence.
 */
export function trajectoryGraders<TOutcome>(reference: TrajectoryReference): Grader<TOutcome>[] {
  const thresholds = reference.thresholds ?? {};
  const graders: Grader<TOutcome>[] = [];

  const add = (
    prefix: string,
    steps: (t: Transcript) => TrajectoryStep[],
    ref: readonly string[],
  ) => {
    for (const metric of TRAJECTORY_METRICS) {
      const name = `${prefix}${METRIC_SUFFIX[metric]}`;
      const threshold = thresholds[name];
      if (threshold === undefined) continue;
      graders.push(
        metricGrader<TOutcome>(
          name,
          threshold,
          (transcript) => computeTrajectoryMetrics(steps(transcript), ref),
          metric,
        ),
      );
    }
  };

  if (reference.nodes) add('trajectory_', nodeSteps, reference.nodes);
  if (reference.toolCalls) {
    add('tool_trajectory_', (t) => toolSteps(t.toolCalls), reference.toolCalls);
  }

  return graders;
}
