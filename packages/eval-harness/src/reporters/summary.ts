import type { SuiteReport } from '../types.js';

const tick = (value: boolean): string => (value ? '✅' : '❌');
const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;

/**
 * A GitHub job-summary Markdown table.
 *
 * The axes line is first and is not optional. A suite run on the stub model set
 * or against no database reports numbers that look exactly like a working one's,
 * and the axes are the only thing on the page that distinguishes them.
 */
export function renderMarkdownSummary(report: SuiteReport<unknown>): string {
  const graderNames = [
    ...new Set(report.tasks.flatMap((task) => Object.keys(task.perGraderPassRate))),
  ];

  const lines: string[] = [
    `## Eval — ${report.suite}`,
    '',
    `**Axes:** model \`${report.axes.model}\`, memory \`${report.axes.memory}\` · ` +
      `**${report.trialsPerTask} trial(s) per task** · ` +
      `**overall pass rate ${percent(report.passRate)}**`,
    '',
    '| Task | pass@k | pass^k | Trials passed |',
    '| ---- | ------ | ------ | ------------- |',
  ];

  for (const task of report.tasks) {
    const passed = task.trials.filter((trial) => trial.passed).length;
    lines.push(
      `| \`${task.taskId}\` | ${tick(task.passAtK)} | ${tick(task.passHatK)} | ${passed}/${task.trials.length} |`,
    );
  }

  if (graderNames.length > 0) {
    lines.push('', '### Per-grader pass rate', '');
    lines.push(`| Grader | ${report.tasks.map((task) => `\`${task.taskId}\``).join(' | ')} |`);
    lines.push(`| ------ | ${report.tasks.map(() => '------').join(' | ')} |`);
    for (const grader of graderNames) {
      const cells = report.tasks.map((task) => {
        const rate = task.perGraderPassRate[grader];
        return rate === undefined ? '—' : percent(rate);
      });
      lines.push(`| \`${grader}\` | ${cells.join(' | ')} |`);
    }
  }

  if (report.uncalibratedGraders.length > 0) {
    lines.push(
      '',
      `> **Uncalibrated judges:** ${report.uncalibratedGraders.map((n) => `\`${n}\``).join(', ')}.`,
      '> Their true-positive and true-negative rates have not been measured against human labels.',
    );
  }

  lines.push('');
  return lines.join('\n');
}
