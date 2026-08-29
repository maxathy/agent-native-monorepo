import { describe, it, expect } from 'vitest';
import { renderJsonReport } from './json.js';
import { renderJUnitReport } from './junit.js';
import { renderMarkdownSummary } from './summary.js';
import type { SuiteReport, Trial } from '../types.js';

function trial(index: number, passed: boolean): Trial {
  return {
    taskId: 'memory-recall-001',
    index,
    transcript: {
      runId: `run-${index}`,
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      messages: [],
      nodeSequence: ['ingress', 'egress'],
      toolCalls: [],
      retrievedContext: [],
      tokenCounts: { prompt: 1, completion: 1 },
      outcome: 'success',
      latencyMs: 1,
    },
    outcome: {},
    results: [
      {
        grader: 'episodic_row_written',
        kind: 'code',
        score: passed
          ? { value: 1, label: 'pass', explanation: '2 episodes row(s)' }
          : { value: 0, label: 'fail', explanation: '0 episodes row(s) & counting' },
      },
    ],
    passed,
  };
}

const report: SuiteReport = {
  suite: 'memory-recall',
  startedAt: '2026-08-29T00:00:00.000Z',
  finishedAt: '2026-08-29T00:01:00.000Z',
  axes: { model: 'live', memory: 'live' },
  trialsPerTask: 2,
  tasks: [
    {
      taskId: 'memory-recall-001',
      description: 'a task',
      trials: [trial(0, true), trial(1, false)],
      passAtK: true,
      passHatK: false,
      perGraderPassRate: { episodic_row_written: 0.5 },
    },
  ],
  passRate: 0.5,
  uncalibratedGraders: ['answer_is_grounded'],
};

describe('renderJsonReport', () => {
  it('round-trips the whole report, transcripts included', () => {
    const parsed = JSON.parse(renderJsonReport(report)) as SuiteReport;
    expect(parsed).toEqual(report);
  });
});

describe('renderJUnitReport', () => {
  it('emits one test case per trial, so failures read as pass^k', () => {
    const xml = renderJUnitReport(report);
    expect(xml).toContain('<testsuites name="memory-recall" tests="2" failures="1">');
    expect(xml).toContain('<testcase name="memory-recall-001 trial 1"/>');
    expect(xml).toContain('<testcase name="memory-recall-001 trial 2">');
    expect(xml).toContain('<property name="pass@k" value="true"/>');
    expect(xml).toContain('<property name="memory_axis" value="live"/>');
  });

  it('escapes a failure message rather than emitting invalid XML', () => {
    const xml = renderJUnitReport(report);
    expect(xml).toContain('0 episodes row(s) &amp; counting');
    expect(xml).not.toContain('& counting');
  });
});

describe('renderMarkdownSummary', () => {
  it('leads with the axes, because nothing else distinguishes a stub run', () => {
    const markdown = renderMarkdownSummary(report);
    expect(markdown).toContain('**Axes:** model `live`, memory `live`');
    expect(markdown).toContain('| `memory-recall-001` | ✅ | ❌ | 1/2 |');
    expect(markdown).toContain('overall pass rate 50%');
  });

  it('names uncalibrated judges rather than presenting a guess as a measurement', () => {
    expect(renderMarkdownSummary(report)).toContain(
      '**Uncalibrated judges:** `answer_is_grounded`',
    );
  });

  it('reports each grader’s pass rate', () => {
    expect(renderMarkdownSummary(report)).toContain('| `episodic_row_written` | 50% |');
  });
});
