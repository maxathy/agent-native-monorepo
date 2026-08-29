import { describe, it, expect } from 'vitest';
import { ModelGrader, SameFamilyJudgeError, humanLabelGrader, type ModelJudge } from './model.js';
import type { Transcript } from '../types.js';

function judge(provider: string, reply: string): ModelJudge {
  return { provider, model: `${provider}-judge`, complete: async () => reply };
}

const transcript: Transcript = {
  runId: '550e8400-e29b-41d4-a716-446655440001',
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  messages: [{ role: 'assistant', content: 'A grounded answer.' }],
  nodeSequence: ['ingress', 'egress'],
  toolCalls: [],
  retrievedContext: [],
  tokenCounts: { prompt: 10, completion: 5 },
  outcome: 'success',
  latencyMs: 12,
};

const options = {
  name: 'answer_is_grounded',
  rubric: 'Is every claim supported by the retrieved context?',
  systemUnderTestProvider: 'google',
};

describe('ModelGrader', () => {
  it('refuses a judge from the system under test’s own family', () => {
    // The agent is Gemini on both paths that matter, so in practice this means
    // a judge that is not Google's — and a second credential this repository
    // does not currently ask for.
    expect(
      () =>
        new ModelGrader({
          ...options,
          judge: judge('google', '{"label":"pass","explanation":"fine"}'),
        }),
    ).toThrow(SameFamilyJudgeError);
  });

  it('still refuses when the opt-in carries no written justification', () => {
    expect(
      () =>
        new ModelGrader({
          ...options,
          judge: judge('google', '{}'),
          allowSameFamilyJudge: true,
        }),
    ).toThrow(SameFamilyJudgeError);
  });

  it('allows same-family judging with an explicit opt-in and a justification', () => {
    expect(
      () =>
        new ModelGrader({
          ...options,
          judge: judge('google', '{"label":"pass","explanation":"fine"}'),
          allowSameFamilyJudge: true,
          sameFamilyJustification: 'Measuring self-preference bias is the experiment.',
        }),
    ).not.toThrow();
  });

  it('accepts a judge from another family without an opt-in', () => {
    expect(
      () =>
        new ModelGrader({
          ...options,
          judge: judge('anthropic', '{"label":"pass","explanation":"fine"}'),
        }),
    ).not.toThrow();
  });

  it('returns a score carrying the judge’s explanation', async () => {
    const grader = new ModelGrader({
      ...options,
      judge: judge('anthropic', '{"label":"fail","explanation":"claim 2 is unsupported"}'),
    });
    const score = await grader.grade(transcript);
    expect(score).toEqual({ value: 0, label: 'fail', explanation: 'claim 2 is unsupported' });
  });

  it('throws on a verdict it cannot parse rather than defaulting to fail', async () => {
    // A model grader that silently returns `fail` on a parse error reports the
    // agent as broken when the judge is.
    const grader = new ModelGrader({ ...options, judge: judge('anthropic', 'not json') });
    await expect(grader.grade(transcript)).rejects.toThrow();
  });

  it('throws when the judge omits the explanation', async () => {
    const grader = new ModelGrader({ ...options, judge: judge('anthropic', '{"label":"pass"}') });
    await expect(grader.grade(transcript)).rejects.toThrow(/no explanation/);
  });

  it('reports itself uncalibrated until measured against human labels', async () => {
    const grader = new ModelGrader({
      ...options,
      judge: judge('anthropic', '{"label":"pass","explanation":"ok"}'),
    });
    expect(grader.calibrationReport).toBeUndefined();

    const report = await grader.calibrate([
      { id: 'a', transcript, label: 'pass' },
      { id: 'b', transcript, label: 'fail' },
    ]);

    // A judge that says `pass` to everything has a perfect true-positive rate
    // and a true-negative rate of zero — which is the number that exposes it.
    expect(report).toEqual({ examples: 2, truePositiveRate: 1, trueNegativeRate: 0 });
    expect(grader.calibrationReport).toEqual(report);
  });
});

describe('humanLabelGrader', () => {
  it('returns the imported label for the run', async () => {
    const grader = humanLabelGrader('human_review', new Map([[transcript.runId, 'fail' as const]]));
    const score = await grader.grade(transcript, undefined);
    expect(score.label).toBe('fail');
    expect(grader.kind).toBe('human');
  });

  it('throws when no label was imported for the run', async () => {
    const grader = humanLabelGrader('human_review', new Map());
    await expect(grader.grade(transcript, undefined)).rejects.toThrow(/no human label/);
  });
});
