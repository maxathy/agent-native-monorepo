// The vocabulary — the types every consumer of this package builds on. P1-B
// (cassette replay), P1-C (the tiered pipeline), P1-D (the statistical gate),
// P1-E (the drift canary), P1-F (budget assertions) and P2-B (the retrieval
// ablation) are all consumers of these.
export {
  MessageSchema,
  TaskSeedsSchema,
  type AgentHarness,
  type Axes,
  type AxisRequirements,
  type Grader,
  type GraderKind,
  type GraderResult,
  type MemoryAxis,
  type Message,
  type ModelAxis,
  type Outcome,
  type Score,
  type SpanRecord,
  type Suite,
  type SuiteReport,
  type Task,
  type TaskReport,
  type TaskSeeds,
  type ToolCall,
  type Transcript,
  type Trial,
} from './types.js';

// The environment state a grader for this system asserts against.
export type { MemoryOutcome } from './outcome.js';

// Which axis a trial is running on, and the refusal when a grader needs one it
// does not have.
export { detectAxes, describeAxes, assertAxesSatisfy, AxisRequirementError } from './axes.js';

// Graders.
export {
  retrievedContextMinLength,
  outcomeMustBe,
  tokenCountsPositive,
  episodicRowWritten,
  entityMerged,
  factsPersistedToBothIndices,
} from './graders/code.js';
export {
  ModelGrader,
  SameFamilyJudgeError,
  humanLabelGrader,
  type JudgeCalibration,
  type LabelledExample,
  type ModelGraderOptions,
  type ModelJudge,
} from './graders/model.js';
export {
  computeTrajectoryMetrics,
  nodeSteps,
  toolSteps,
  trajectoryGraders,
  TRAJECTORY_METRICS,
  type TrajectoryMetricName,
  type TrajectoryMetrics,
  type TrajectoryReference,
  type TrajectoryStep,
} from './graders/trajectory.js';

// Runner.
export { EvalHarness, type EvalHarnessOptions } from './harness.js';

// Reporters.
export { renderJsonReport } from './reporters/json.js';
export { renderJUnitReport } from './reporters/junit.js';
export { renderMarkdownSummary } from './reporters/summary.js';
